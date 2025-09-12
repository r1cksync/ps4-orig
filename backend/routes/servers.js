import express from 'express';
import mongoose from 'mongoose';
import Server from '../models/Server.js';
import Channel from '../models/Channel.js';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/servers
// @desc    Get user's servers
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const servers = await req.user.getServers();
    res.json(servers);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers
// @desc    Create a new server
// @access  Private
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, icon, banner } = req.body;

    // Validate required fields
    if (!name || name.trim().length < 2) {
      return res.status(400).json({ message: 'Server name must be at least 2 characters long' });
    }

    // Create server
    const server = new Server({
      name: name.trim(),
      description: description?.trim(),
      icon,
      banner,
      owner: req.user._id,
      members: [{
        user: req.user._id,
        joinedAt: new Date(),
        roles: [] // Owner role will be added after creation
      }]
    });

    await server.save();

    // Create default roles
    const everyoneRole = new Role({
      name: '@everyone',
      server: server._id,
      position: 0,
      permissions: [
        'VIEW_CHANNEL',
        'SEND_MESSAGES',
        'READ_MESSAGE_HISTORY',
        'USE_VAD',
        'CONNECT',
        'SPEAK'
      ],
      isEveryone: true
    });

    const ownerRole = new Role({
      name: 'Owner',
      server: server._id,
      position: 1000,
      permissions: [
        'ADMINISTRATOR'
      ],
      color: 16711680 // Red color as integer
    });

    await Promise.all([everyoneRole.save(), ownerRole.save()]);

    // Add owner role to user
    const memberIndex = server.members.findIndex(m => m.user.toString() === req.user._id.toString());
    if (memberIndex !== -1) {
      server.members[memberIndex].roles.push(ownerRole._id);
      await server.save();
    }

    // Create default channels
    const generalCategory = new Channel({
      name: 'General',
      type: 'CATEGORY',
      server: server._id,
      position: 0
    });

    const generalChannel = new Channel({
      name: 'general',
      type: 'TEXT',
      server: server._id,
      category: generalCategory._id,
      position: 0
    });

    const voiceChannel = new Channel({
      name: 'General Voice',
      type: 'VOICE',
      server: server._id,
      category: generalCategory._id,
      position: 1
    });

    await Promise.all([
      generalCategory.save(),
      generalChannel.save(),
      voiceChannel.save()
    ]);

    // Populate and return server
    const populatedServer = await Server.findById(server._id)
      .populate('members.user', 'username discriminator displayName avatar status')
      .populate('owner', 'username discriminator displayName avatar');

    // Emit real-time server creation event
    req.app.get('io').to(`user:${req.user._id}`).emit('serverCreated', {
      server: populatedServer
    });

    res.status(201).json(populatedServer);
  } catch (error) {
    console.error('Error creating server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId
// @desc    Get server details
// @access  Private
router.get('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar status lastSeen')
      .populate('owner', 'username discriminator displayName avatar');

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is a member
    const isMember = server.members.some(member => member.user._id.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'Not a member of this server' });
    }

    res.json(server);
  } catch (error) {
    console.error('Error fetching server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/servers/:serverId
// @desc    Update server
// @access  Private
router.put('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, description, icon, banner } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions (only owner or admin can edit)
    const canManage = await server.hasPermission(req.user._id, 'manageServer');
    if (!canManage) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Update fields
    if (name) server.name = name.trim();
    if (description !== undefined) server.description = description?.trim();
    if (icon !== undefined) server.icon = icon;
    if (banner !== undefined) server.banner = banner;

    await server.save();

    const updatedServer = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar status')
      .populate('owner', 'username discriminator displayName avatar');

    // Emit real-time server update to all members
    req.app.get('io').to(`server:${serverId}`).emit('serverUpdated', {
      serverId,
      updates: {
        name: updatedServer.name,
        description: updatedServer.description,
        icon: updatedServer.icon,
        banner: updatedServer.banner
      }
    });

    res.json(updatedServer);
  } catch (error) {
    console.error('Error updating server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/servers/:serverId
// @desc    Delete server
// @access  Private
router.delete('/:serverId', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Only owner can delete server
    if (!server.owner.equals(req.user._id)) {
      return res.status(403).json({ message: 'Only server owner can delete the server' });
    }

    // Emit real-time server deletion to all members
    req.app.get('io').to(`server:${serverId}`).emit('serverDeleted', {
      serverId
    });

    // Delete all related data
    await Promise.all([
      Channel.deleteMany({ server: serverId }),
      Role.deleteMany({ server: serverId }),
      Server.findByIdAndDelete(serverId)
    ]);

    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error('Error deleting server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/:serverId/join
// @desc    Join server with invite code
// @access  Private
router.post('/:serverId/join', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { inviteCode } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if already a member
    if (server.isMember(req.user._id)) {
      return res.status(400).json({ message: 'Already a member of this server' });
    }

    // Validate invite code if provided
    if (inviteCode && !server.inviteCodes.some(invite => invite.code === inviteCode)) {
      return res.status(400).json({ message: 'Invalid invite code' });
    }

    await server.addMember(req.user._id);

    const updatedServer = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar status');

    // Emit real-time member joined event
    req.app.get('io').to(`server:${serverId}`).emit('memberJoined', {
      serverId,
      member: {
        user: req.user,
        joinedAt: new Date(),
        roles: []
      }
    });

    res.json({ message: 'Successfully joined server', server: updatedServer });
  } catch (error) {
    console.error('Error joining server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/:serverId/leave
// @desc    Leave server
// @access  Private
router.post('/:serverId/leave', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Owner cannot leave their own server
    if (server.owner.equals(req.user._id)) {
      return res.status(400).json({ message: 'Server owner cannot leave. Transfer ownership or delete the server.' });
    }

    // Check if user is a member
    if (!server.isMember(req.user._id)) {
      return res.status(400).json({ message: 'Not a member of this server' });
    }

    await server.removeMember(req.user._id);

    // Emit real-time member left event
    req.app.get('io').to(`server:${serverId}`).emit('memberLeft', {
      serverId,
      userId: req.user._id,
      reason: 'left'
    });

    res.json({ message: 'Successfully left server' });
  } catch (error) {
    console.error('Error leaving server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/channels
// @desc    Get server channels
// @access  Private
router.get('/:serverId/channels', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is a member
    if (!server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Not a member of this server' });
    }

    // **CHANGED**: Fetch all non-deleted channels without per-channel permission checks
    const channels = await Channel.find({ server: serverId, isDeleted: false })
      .sort({ position: 1 })
      .populate('category', 'name');

    console.log('Returning channels:', channels); // **NEW**: Debug log to verify channels sent
    res.json(channels);
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/roles
// @desc    Get server roles
// @access  Private
router.get('/:serverId/roles', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is a member
    if (!server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Not a member of this server' });
    }

    const roles = await Role.find({ server: serverId })
      .sort({ position: -1 });

    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/:serverId/invites
// @desc    Create invite code
// @access  Private
router.post('/:serverId/invites', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { maxUses = null, expiresAt = null } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canCreateInvite = await server.hasPermission(req.user._id, 'CREATE_INSTANT_INVITE');
    if (!canCreateInvite) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const inviteCode = await server.createInviteCode(req.user._id, maxUses, expiresAt);

    // Emit real-time invite created event
    req.app.get('io').to(`server:${serverId}`).emit('inviteCreated', {
      serverId,
      code: inviteCode,
      createdBy: req.user._id,
      maxUses,
      expiresAt
    });

    res.status(201).json({ 
      code: inviteCode,
      url: `${process.env.FRONTEND_URL}/invite/${inviteCode}`
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/members
// @desc    Get server members
// @access  Private
router.get('/:serverId/members', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar status lastSeen')
      .populate('members.roles', 'name color position permissions');

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check if user is a member
    if (!server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Not a member of this server' });
    }

    res.json(server.members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/servers/:serverId/members/:userId
// @desc    Kick member from server
// @access  Private
router.delete('/:serverId/members/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid server or user ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canKick = await server.hasPermission(req.user._id, 'kickMembers');
    if (!canKick) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Cannot kick owner
    if (server.owner.equals(userId)) {
      return res.status(400).json({ message: 'Cannot kick server owner' });
    }

    // Cannot kick yourself
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ message: 'Cannot kick yourself' });
    }

    // Check if target is member
    if (!server.isMember(userId)) {
      return res.status(400).json({ message: 'User is not a member of this server' });
    }

    await server.kickMember(userId, req.user._id, reason);

    // Emit real-time member kicked event
    req.app.get('io').to(`server:${serverId}`).emit('memberLeft', {
      serverId,
      userId,
      reason: 'kicked',
      kickedBy: req.user._id,
      kickReason: reason
    });

    // Notify the kicked user directly
    req.app.get('io').to(`user:${userId}`).emit('kickedFromServer', {
      serverId,
      serverName: server.name,
      reason,
      kickedBy: req.user.username
    });

    res.json({ message: 'Member kicked successfully' });
  } catch (error) {
    console.error('Error kicking member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/:serverId/bans
// @desc    Ban member from server
// @access  Private
router.post('/:serverId/bans', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { userId, reason, deleteMessageDays = 0, expiresAt } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid server or user ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canBan = await server.hasPermission(req.user._id, 'banMembers');
    if (!canBan) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Cannot ban owner
    if (server.owner.equals(userId)) {
      return res.status(400).json({ message: 'Cannot ban server owner' });
    }

    // Cannot ban yourself
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ message: 'Cannot ban yourself' });
    }

    await server.banMember(userId, req.user._id, reason, expiresAt);

    // Emit real-time member banned event
    req.app.get('io').to(`server:${serverId}`).emit('memberBanned', {
      serverId,
      userId,
      bannedBy: req.user._id,
      reason,
      expiresAt
    });

    // Notify the banned user directly
    req.app.get('io').to(`user:${userId}`).emit('bannedFromServer', {
      serverId,
      serverName: server.name,
      reason,
      expiresAt,
      bannedBy: req.user.username
    });

    res.json({ message: 'Member banned successfully' });
  } catch (error) {
    console.error('Error banning member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/bans
// @desc    Get server bans
// @access  Private
router.get('/:serverId/bans', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId)
      .populate('bans.user', 'username discriminator displayName avatar')
      .populate('bans.bannedBy', 'username discriminator displayName avatar');

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canViewBans = await server.hasPermission(req.user._id, 'banMembers');
    if (!canViewBans) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    res.json(server.bans);
  } catch (error) {
    console.error('Error fetching bans:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/servers/:serverId/bans/:userId
// @desc    Unban member from server
// @access  Private
router.delete('/:serverId/bans/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid server or user ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canUnban = await server.hasPermission(req.user._id, 'banMembers');
    if (!canUnban) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await server.unbanMember(userId);

    // Emit real-time member unbanned event
    req.app.get('io').to(`server:${serverId}`).emit('memberUnbanned', {
      serverId,
      userId,
      unbannedBy: req.user._id
    });

    // Notify the unbanned user directly
    req.app.get('io').to(`user:${userId}`).emit('unbannedFromServer', {
      serverId,
      serverName: server.name,
      unbannedBy: req.user.username
    });

    res.json({ message: 'Member unbanned successfully' });
  } catch (error) {
    console.error('Error unbanning member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/servers/:serverId/members/:userId
// @desc    Update member roles and nickname
// @access  Private
router.patch('/:serverId/members/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, userId } = req.params;
    const { roles, nickname } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid server or user ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    let canManageRoles = false;
    let canManageNicknames = false;

    if (roles !== undefined) {
      canManageRoles = await server.hasPermission(req.user._id, 'manageRoles');
      if (!canManageRoles) {
        return res.status(403).json({ message: 'Insufficient permissions to manage roles' });
      }
    }

    if (nickname !== undefined) {
      canManageNicknames = await server.hasPermission(req.user._id, 'manageNicknames');
      if (!canManageNicknames && req.user._id.toString() !== userId) {
        return res.status(403).json({ message: 'Insufficient permissions to manage nicknames' });
      }
    }

    // Update member
    if (roles !== undefined) {
      await server.updateMemberRoles(userId, roles);
    }
    
    if (nickname !== undefined) {
      await server.updateMemberNickname(userId, nickname);
    }

    const updatedServer = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar')
      .populate('members.roles', 'name color position');

    const updatedMember = updatedServer.members.find(m => m.user._id.toString() === userId);

    // Emit real-time member updated event
    req.app.get('io').to(`server:${serverId}`).emit('memberUpdated', {
      serverId,
      member: updatedMember,
      updatedBy: req.user._id,
      changes: {
        roles: roles !== undefined,
        nickname: nickname !== undefined
      }
    });

    res.json(updatedMember);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/invites
// @desc    Get server invites
// @access  Private
router.get('/:serverId/invites', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId)
      .populate('invites.creator', 'username discriminator displayName avatar')
      .populate('invites.channel', 'name type');

    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageServer = await server.hasPermission(req.user._id, 'manageServer');
    if (!canManageServer) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const validInvites = server.getValidInvites();
    res.json(validInvites);
  } catch (error) {
    console.error('Error fetching invites:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/servers/:serverId/invites/:inviteCode
// @desc    Delete server invite
// @access  Private
router.delete('/:serverId/invites/:inviteCode', authenticate, async (req, res) => {
  try {
    const { serverId, inviteCode } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    const invite = server.invites.find(i => i.code === inviteCode);
    if (!invite) {
      return res.status(404).json({ message: 'Invite not found' });
    }

    // Check permissions (creator can delete their own invite, or user with manage server)
    const canManageServer = await server.hasPermission(req.user._id, 'manageServer');
    const isCreator = invite.creator.toString() === req.user._id.toString();
    
    if (!canManageServer && !isCreator) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await server.deleteInvite(inviteCode);

    res.json({ message: 'Invite deleted successfully' });
  } catch (error) {
    console.error('Error deleting invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/join/:inviteCode
// @desc    Join server via invite code
// @access  Private
router.post('/join/:inviteCode', authenticate, async (req, res) => {
  try {
    const { inviteCode } = req.params;

    const server = await Server.findOne({ 'invites.code': inviteCode });
    
    if (!server) {
      return res.status(404).json({ message: 'Invalid invite code' });
    }

    const invite = server.invites.find(i => i.code === inviteCode);
    
    // Check if invite is valid
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'Invite has expired' });
    }
    
    if (invite.maxUses && invite.uses >= invite.maxUses) {
      return res.status(400).json({ message: 'Invite has reached maximum uses' });
    }

    // Check if user is banned
    if (server.isBanned(req.user._id)) {
      return res.status(403).json({ message: 'You are banned from this server' });
    }

    // Check if already a member
    if (server.isMember(req.user._id)) {
      return res.status(400).json({ message: 'You are already a member of this server' });
    }

    // Add member and increment invite usage
    await server.addMember(req.user._id);
    await server.useInvite(inviteCode);

    const updatedServer = await Server.findById(server._id)
      .populate('owner', 'username discriminator displayName avatar')
      .populate('members.user', 'username discriminator displayName avatar');

    res.json({ message: 'Joined server successfully', server: updatedServer });
  } catch (error) {
    console.error('Error joining server:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PATCH /api/servers/:serverId/settings
// @desc    Update server settings
// @access  Private
router.patch('/:serverId/settings', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { 
      verificationLevel, 
      defaultMessageNotifications, 
      explicitContentFilter,
      afkChannelId,
      afkTimeout,
      systemChannelId,
      rulesChannelId,
      publicUpdatesChannelId,
      vanityURLCode,
      premiumTier,
      premiumSubscriptionCount 
    } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageServer = await server.hasPermission(req.user._id, 'MANAGE_GUILD');
    if (!canManageServer) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Update settings
    if (verificationLevel !== undefined) server.settings.verificationLevel = verificationLevel;
    if (defaultMessageNotifications !== undefined) server.settings.defaultMessageNotifications = defaultMessageNotifications;
    if (explicitContentFilter !== undefined) server.settings.explicitContentFilter = explicitContentFilter;
    if (afkChannelId !== undefined) server.settings.afkChannelId = afkChannelId;
    if (afkTimeout !== undefined) server.settings.afkTimeout = afkTimeout;
    if (systemChannelId !== undefined) server.settings.systemChannelId = systemChannelId;
    if (rulesChannelId !== undefined) server.settings.rulesChannelId = rulesChannelId;
    if (publicUpdatesChannelId !== undefined) server.settings.publicUpdatesChannelId = publicUpdatesChannelId;
    if (vanityURLCode !== undefined) server.settings.vanityURLCode = vanityURLCode;
    if (premiumTier !== undefined) server.settings.premiumTier = premiumTier;
    if (premiumSubscriptionCount !== undefined) server.settings.premiumSubscriptionCount = premiumSubscriptionCount;

    await server.save();

    res.json({ message: 'Server settings updated successfully', settings: server.settings });
  } catch (error) {
    console.error('Error updating server settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   POST /api/servers/:serverId/emojis
// @desc    Add custom emoji to server
// @access  Private
router.post('/:serverId/emojis', authenticate, async (req, res) => {
  try {
    const { serverId } = req.params;
    const { name, url, animated = false } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageEmojis = await server.hasPermission(req.user._id, 'manageEmojis');
    if (!canManageEmojis) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    // Generate unique emoji ID
    const emojiId = new mongoose.Types.ObjectId().toString();

    await server.addEmoji(name, emojiId, url, req.user._id, animated);

    const newEmoji = server.emojis[server.emojis.length - 1];

    res.status(201).json(newEmoji);
  } catch (error) {
    console.error('Error adding emoji:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   DELETE /api/servers/:serverId/emojis/:emojiId
// @desc    Remove custom emoji from server
// @access  Private
router.delete('/:serverId/emojis/:emojiId', authenticate, async (req, res) => {
  try {
    const { serverId, emojiId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId)) {
      return res.status(400).json({ message: 'Invalid server ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManageEmojis = await server.hasPermission(req.user._id, 'manageEmojis');
    if (!canManageEmojis) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    await server.removeEmoji(emojiId);

    res.json({ message: 'Emoji removed successfully' });
  } catch (error) {
    console.error('Error removing emoji:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   GET /api/servers/:serverId/channels/:channelId/permissions
// @desc    Get channel permissions
// @access  Private
router.get('/:serverId/channels/:channelId/permissions', authenticate, async (req, res) => {
  try {
    const { serverId, channelId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid server or channel ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    if (!server.isMember(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const Channel = mongoose.model('Channel');
    const channel = await Channel.findOne({ _id: channelId, server: serverId });
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Return channel permission overwrites (for now just return empty array)
    res.json({
      channelId,
      permissions: []
    });
  } catch (error) {
    console.error('Error fetching channel permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// @route   PUT /api/servers/:serverId/channels/:channelId/permissions/:targetId
// @desc    Update channel permissions for role or user
// @access  Private
router.put('/:serverId/channels/:channelId/permissions/:targetId', authenticate, async (req, res) => {
  try {
    const { serverId, channelId, targetId } = req.params;
    const { allow = [], deny = [], type = 'role' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(serverId) || !mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ message: 'Invalid server or channel ID' });
    }

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Server not found' });
    }

    // Check permissions
    const canManage = await server.hasPermission(req.user._id, 'MANAGE_CHANNELS');
    if (!canManage) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const Channel = mongoose.model('Channel');
    const channel = await Channel.findOne({ _id: channelId, server: serverId });
    if (!channel) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // For now, just return success (full implementation would update channel permission overwrites)
    res.json({
      message: 'Channel permissions updated successfully',
      targetId,
      type,
      allow,
      deny
    });
  } catch (error) {
    console.error('Error updating channel permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

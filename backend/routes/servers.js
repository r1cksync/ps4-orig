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

    const channels = await Channel.find({ server: serverId })
      .sort({ position: 1 })
      .populate('category', 'name');

    // Filter channels based on permissions
    const visibleChannels = [];
    for (const channel of channels) {
      const canView = await server.hasPermission(req.user._id, 'viewChannels', channel._id);
      if (canView) {
        visibleChannels.push(channel);
      }
    }

    res.json(visibleChannels);
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
    const canCreateInvite = await server.hasPermission(req.user._id, 'createInvite');
    if (!canCreateInvite) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const inviteCode = await server.createInviteCode(req.user._id, maxUses, expiresAt);

    res.status(201).json({ 
      code: inviteCode,
      url: `${process.env.FRONTEND_URL}/invite/${inviteCode}`
    });
  } catch (error) {
    console.error('Error creating invite:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;

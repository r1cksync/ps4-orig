import express from 'express';
import Server from '../models/Server.js';
import Role from '../models/Role.js';
import { authenticate } from '../middleware/auth.js';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// Get available permissions
router.get('/permissions', authenticate, async (req, res) => {
  try {
    const permissions = [
      // General permissions
      'CREATE_INSTANT_INVITE',
      'KICK_MEMBERS',
      'BAN_MEMBERS',
      'ADMINISTRATOR',
      'MANAGE_CHANNELS',
      'MANAGE_GUILD',
      'ADD_REACTIONS',
      'VIEW_AUDIT_LOG',
      'PRIORITY_SPEAKER',
      'STREAM',
      'VIEW_CHANNEL',
      'SEND_MESSAGES',
      'SEND_TTS_MESSAGES',
      'MANAGE_MESSAGES',
      'EMBED_LINKS',
      'ATTACH_FILES',
      'READ_MESSAGE_HISTORY',
      'MENTION_EVERYONE',
      'USE_EXTERNAL_EMOJIS',
      'VIEW_GUILD_INSIGHTS',
      'CONNECT',
      'SPEAK',
      'MUTE_MEMBERS',
      'DEAFEN_MEMBERS',
      'MOVE_MEMBERS',
      'USE_VAD',
      'CHANGE_NICKNAME',
      'MANAGE_NICKNAMES',
      'MANAGE_ROLES',
      'MANAGE_WEBHOOKS',
      'MANAGE_EMOJIS',
      'USE_SLASH_COMMANDS',
      'REQUEST_TO_SPEAK',
      'MANAGE_EVENTS',
      'MANAGE_THREADS',
      'CREATE_PUBLIC_THREADS',
      'CREATE_PRIVATE_THREADS',
      'USE_EXTERNAL_STICKERS',
      'SEND_MESSAGES_IN_THREADS',
      'USE_EMBEDDED_ACTIVITIES',
      'MODERATE_MEMBERS'
    ];

    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// Get server roles
router.get('/:serverId/roles', authenticate, async (req, res) => {
  try {
    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    if (!server.isMember(req.user._id) && !server.isOwner(req.user._id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const roles = await Role.find({ server: req.params.serverId }).sort({ position: -1 });
    res.json(roles);
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

// Create new role
router.post('/:serverId/roles', authenticate, [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Role name must be 1-100 characters'),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color'),
  body('permissions').optional().isArray().withMessage('Permissions must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const { name, color = '#99AAB5', permissions = [], mentionable = false, hoist = false } = req.body;

    // Convert hex color to integer
    let colorInteger = 0;
    if (color && typeof color === 'string' && color.startsWith('#')) {
      colorInteger = parseInt(color.slice(1), 16);
    } else if (typeof color === 'number') {
      colorInteger = color;
    }

    // Get highest position for new role
    const existingRoles = await Role.find({ server: req.params.serverId });
    const maxPosition = Math.max(...existingRoles.map(role => role.position), 0);

    const role = new Role({
      name,
      server: req.params.serverId,
      color: colorInteger,
      permissions,
      mentionable,
      hoist,
      position: maxPosition + 1
    });

    await role.save();

    // Emit real-time role created event
    req.app.get('io').to(`server:${req.params.serverId}`).emit('roleCreated', {
      serverId: req.params.serverId,
      role,
      createdBy: req.user._id
    });

    res.status(201).json(role);
  } catch (error) {
    console.error('Error creating role:', error);
    res.status(500).json({ error: 'Failed to create role' });
  }
});

// Reorder roles (must come before general role update route)
router.patch('/:serverId/roles/reorder', authenticate, [
  body('roles').isArray().withMessage('Roles must be an array'),
  body('roles.*.id').notEmpty().withMessage('Role ID is required'),
  body('roles.*.position').isInt({ min: 0 }).withMessage('Position must be a non-negative integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const { roles } = req.body;

    // Update all role positions
    const updatePromises = roles.map(({ id, position }) =>
      Role.findOneAndUpdate(
        { _id: id, server: req.params.serverId },
        { position },
        { new: true }
      )
    );

    const updatedRoles = await Promise.all(updatePromises);

    // Emit real-time roles reordered event
    req.app.get('io').to(`server:${req.params.serverId}`).emit('rolesReordered', {
      serverId: req.params.serverId,
      roles: updatedRoles.filter(role => role !== null),
      reorderedBy: req.user._id
    });

    res.json(updatedRoles.filter(role => role !== null));
  } catch (error) {
    console.error('Error reordering roles:', error);
    res.status(500).json({ error: 'Failed to reorder roles' });
  }
});

// Update role
router.patch('/:serverId/roles/:roleId', authenticate, [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i),
  body('permissions').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const role = await Role.findOne({ _id: req.params.roleId, server: req.params.serverId });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Cannot edit @everyone role permissions
    if (role.isDefault && req.body.permissions) {
      return res.status(400).json({ error: 'Cannot modify @everyone role permissions directly' });
    }

    const { name, color, permissions, mentionable, hoist, position } = req.body;

    if (name !== undefined) role.name = name;
    if (color !== undefined) {
      if (typeof color === 'string' && color.startsWith('#')) {
        role.color = parseInt(color.slice(1), 16);
      } else if (typeof color === 'number') {
        role.color = color;
      }
    }
    if (permissions !== undefined) role.permissions = permissions;
    if (mentionable !== undefined) role.mentionable = mentionable;
    if (hoist !== undefined) role.hoist = hoist;
    if (position !== undefined) role.position = position;

    await role.save();

    // Emit real-time role updated event
    req.app.get('io').to(`server:${req.params.serverId}`).emit('roleUpdated', {
      serverId: req.params.serverId,
      role,
      updatedBy: req.user._id,
      changes: { name, color, permissions, mentionable, hoist, position }
    });

    res.json(role);
  } catch (error) {
    console.error('Error updating role:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
});

// Delete role
router.delete('/:serverId/roles/:roleId', authenticate, async (req, res) => {
  try {
    const server = await Server.findById(req.params.serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const role = await Role.findOne({ _id: req.params.roleId, server: req.params.serverId });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Cannot delete @everyone role
    if (role.isDefault) {
      return res.status(400).json({ error: 'Cannot delete @everyone role' });
    }

    // Remove role from all members
    await Server.updateMany(
      { _id: req.params.serverId, 'members.roles': req.params.roleId },
      { $pull: { 'members.$.roles': req.params.roleId } }
    );

    await Role.findByIdAndDelete(req.params.roleId);

    // Emit real-time role deleted event
    req.app.get('io').to(`server:${req.params.serverId}`).emit('roleDeleted', {
      serverId: req.params.serverId,
      roleId: req.params.roleId,
      roleName: role.name,
      deletedBy: req.user._id
    });

    res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    console.error('Error deleting role:', error);
    res.status(500).json({ error: 'Failed to delete role' });
  }
});

// Assign role to member
router.post('/:serverId/roles/:roleId/assign/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, roleId, userId } = req.params;

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const role = await Role.findOne({ _id: roleId, server: serverId });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if user is a member of the server
    const memberIndex = server.members.findIndex(m => 
      m.user._id ? m.user._id.toString() === userId : m.user.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'User is not a member of this server' });
    }

    // Check if user already has this role
    const currentRoles = server.members[memberIndex].roles || [];
    if (currentRoles.some(r => r.toString() === roleId)) {
      return res.status(400).json({ error: 'User already has this role' });
    }

    // Add role to member
    server.members[memberIndex].roles.push(roleId);
    await server.save();

    const updatedServer = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar')
      .populate('members.roles', 'name color position permissions');

    const updatedMember = updatedServer.members[memberIndex];

    // Emit real-time role assigned event
    req.app.get('io').to(`server:${serverId}`).emit('roleAssigned', {
      serverId,
      userId,
      roleId,
      role,
      member: updatedMember,
      assignedBy: req.user._id
    });

    res.json({ message: 'Role assigned successfully', member: updatedMember });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ error: 'Failed to assign role' });
  }
});

// Remove role from member
router.delete('/:serverId/roles/:roleId/assign/:userId', authenticate, async (req, res) => {
  try {
    const { serverId, roleId, userId } = req.params;

    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ error: 'Server not found' });
    }

    // Check permissions
    if (!server.isOwner(req.user._id)) {
      const hasPermission = await server.hasPermission(req.user._id, 'MANAGE_ROLES');
      if (!hasPermission) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    const role = await Role.findOne({ _id: roleId, server: serverId });
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    // Check if user is a member of the server
    const memberIndex = server.members.findIndex(m => 
      m.user._id ? m.user._id.toString() === userId : m.user.toString() === userId
    );
    
    if (memberIndex === -1) {
      return res.status(404).json({ error: 'User is not a member of this server' });
    }

    // Check if user has this role
    const currentRoles = server.members[memberIndex].roles || [];
    const roleIndex = currentRoles.findIndex(r => r.toString() === roleId);
    
    if (roleIndex === -1) {
      return res.status(400).json({ error: 'User does not have this role' });
    }

    // Remove role from member
    server.members[memberIndex].roles.splice(roleIndex, 1);
    await server.save();

    const updatedServer = await Server.findById(serverId)
      .populate('members.user', 'username discriminator displayName avatar')
      .populate('members.roles', 'name color position permissions');

    const updatedMember = updatedServer.members[memberIndex];

    // Emit real-time role removed event
    req.app.get('io').to(`server:${serverId}`).emit('roleRemoved', {
      serverId,
      userId,
      roleId,
      role,
      member: updatedMember,
      removedBy: req.user._id
    });

    res.json({ message: 'Role removed successfully', member: updatedMember });
  } catch (error) {
    console.error('Error removing role:', error);
    res.status(500).json({ error: 'Failed to remove role' });
  }
});

export default router;
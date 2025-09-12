'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import io from 'socket.io-client';
import { useAuth } from '../../../authImplementation';
import ProfileSection from '../../../components/ProfileSection';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function Roles() {
  const { serverId } = useParams();
  const { user, token, loading: authLoading } = useAuth();
  
  // State declarations
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [server, setServer] = useState(null);
  const [members, setMembers] = useState([]);
  const [newRole, setNewRole] = useState({
    name: '',
    color: '#99AAB5',
    permissions: [],
    hoist: false,
    mentionable: true,
  });
  const [editRole, setEditRole] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);

  // Sensors for dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!token || !user) return;

    const socket = io(SOCKET_URL, {
      auth: { token: `Bearer ${token}` },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      timeout: 20000,
    });

    socket.on('connect', () => {
      console.log('Socket.IO connected for roles page');
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket.IO connection warning (non-critical):', err.message);
    });

    socket.on('roleCreated', (data) => {
      if (data.serverId === serverId) {
        setRoles((prevRoles) => [...prevRoles, data.role]);
        setSuccess(`Role "${data.role.name}" created successfully`);
        setTimeout(() => setSuccess(null), 3000);
      }
    });

    socket.on('rolesReordered', (data) => {
      if (data.serverId === serverId) {
        setRoles(data.roles.sort((a, b) => b.position - a.position));
        setSuccess('Roles reordered successfully');
        setTimeout(() => setSuccess(null), 3000);
      }
    });

    socket.on('roleUpdated', (data) => {
      if (data.serverId === serverId) {
        setRoles((prevRoles) =>
          prevRoles.map((role) =>
            role._id === data.role._id ? data.role : role
          )
        );
        setSuccess(`Role "${data.role.name}" updated successfully`);
        setEditRole(null);
        setTimeout(() => setSuccess(null), 3000);
      }
    });

    socket.on('roleDeleted', (data) => {
      if (data.serverId === serverId) {
        setRoles((prevRoles) =>
          prevRoles.filter((role) => role._id !== data.roleId)
        );
        setSuccess(`Role "${data.roleName}" deleted successfully`);
        setTimeout(() => setSuccess(null), 3000);
      }
    });

    socket.on('roleAssigned', async (data) => {
      if (data.serverId === serverId) {
        // Refresh members to ensure latest role data
        try {
          const membersResponse = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setMembers(membersResponse.data);
          if (selectedMember && selectedMember.user._id === data.member.user._id) {
            setSelectedMember(membersResponse.data.find((m) => m.user._id === data.member.user._id));
          }
          setSuccess(`Role "${data.role.name}" assigned to ${data.member.user.displayName}`);
          setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
          console.error('Error refreshing members after roleAssigned:', err);
          setError('Failed to refresh member data');
        }
      }
    });

    socket.on('roleRemoved', async (data) => {
      if (data.serverId === serverId) {
        // Refresh members to ensure latest role data
        try {
          const membersResponse = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          setMembers(membersResponse.data);
          if (selectedMember && selectedMember.user._id === data.member.user._id) {
            setSelectedMember(membersResponse.data.find((m) => m.user._id === data.member.user._id));
          }
          setSuccess(`Role "${data.role.name}" removed from ${data.member.user.displayName}`);
          setTimeout(() => setSuccess(null), 3000);
        } catch (err) {
          console.error('Error refreshing members after roleRemoved:', err);
          setError('Failed to refresh member data');
        }
      }
    });

    return () => {
      socket.off('roleCreated');
      socket.off('rolesReordered');
      socket.off('roleUpdated');
      socket.off('roleDeleted');
      socket.off('roleAssigned');
      socket.off('roleRemoved');
      socket.disconnect();
    };
  }, [serverId, token, user]);

  // Fetch server, permissions, members, and roles
  useEffect(() => {
    if (!token || !serverId || !user || authLoading) {
      setLoading(false);
      return;
    }

    const fetchAllData = async () => {
      setLoading(true);
      try {
        const serverResponse = await axios.get(`${BASE_URL}/servers/${serverId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setServer(serverResponse.data);

        const isOwner = serverResponse.data.owner?._id === user.id;
        const hasManageRoles = isOwner || await checkUserPermission(serverResponse.data, user.id);
        setHasPermission(hasManageRoles);

        const permissionsResponse = await axios.get(`${BASE_URL}/roles/permissions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setPermissions(permissionsResponse.data.permissions || permissionsResponse.data);

        const membersResponse = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMembers(membersResponse.data);

        const rolesResponse = await axios.get(`${BASE_URL}/servers/${serverId}/roles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoles(rolesResponse.data);

        setError(null);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.response?.data?.error || err.response?.data?.message || 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [serverId, token, user, authLoading]);

  // Check user permission for MANAGE_ROLES
  const checkUserPermission = async (serverData, userId) => {
    try {
      if (serverData.owner?._id === userId) return true;

      const member = serverData.members?.find((m) => m.user._id === userId);
      if (!member || !member.roles || member.roles.length === 0) return false;

      return member.roles.some((role) =>
        role.permissions?.includes('ADMINISTRATOR') || role.permissions?.includes('MANAGE_ROLES')
      );
    } catch (error) {
      console.error('Error checking permissions:', error);
      return false;
    }
  };

  // Handle form input changes for create/edit
  const handleInputChange = (e, setter) => {
    const { name, value, type, checked } = e.target;
    setter((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Handle permission checkbox changes for create/edit
  const handlePermissionChange = (permission, setter) => {
    setter((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((p) => p !== permission)
        : [...prev.permissions, permission],
    }));
  };

  // Handle create role submission
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!newRole.name.trim()) {
      setError('Role name is required');
      return;
    }

    try {
      setError(null);
      const validPermissions = newRole.permissions.filter((perm) => permissions.includes(perm));
      const response = await axios.post(
        `${BASE_URL}/servers/${serverId}/roles`,
        {
          name: newRole.name.trim(),
          color: newRole.color,
          permissions: validPermissions,
          hoist: newRole.hoist,
          mentionable: newRole.mentionable,
        },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      setRoles((prevRoles) => [...prevRoles, response.data]);
      setSuccess(`Role "${response.data.name}" created successfully`);
      setNewRole({
        name: '',
        color: '#99AAB5',
        permissions: [],
        hoist: false,
        mentionable: true,
      });
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error creating role:', err);
      const errorMessage =
        err.response?.data?.errors?.map((e) => e.msg).join(', ') ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to create role';
      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Handle edit role submission
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editRole.name.trim()) {
      setError('Role name is required');
      return;
    }

    try {
      setError(null);
      const validPermissions = editRole.permissions.filter((perm) => permissions.includes(perm));
      const payload = {};
      if (editRole.name.trim() !== editRole.originalName) {
        payload.name = editRole.name.trim();
      }
      if (editRole.color !== editRole.originalColor) {
        payload.color = editRole.color;
      }
      if (JSON.stringify(editRole.permissions) !== JSON.stringify(editRole.originalPermissions)) {
        payload.permissions = validPermissions;
      }
      if (editRole.hoist !== editRole.originalHoist) {
        payload.hoist = editRole.hoist;
      }
      if (editRole.mentionable !== editRole.originalMentionable) {
        payload.mentionable = editRole.mentionable;
      }

      if (Object.keys(payload).length === 0) {
        setEditRole(null);
        setSuccess('No changes to save');
        setTimeout(() => setSuccess(null), 3000);
        return;
      }

      const response = await axios.patch(
        `${BASE_URL}/servers/${serverId}/roles/${editRole._id}`,
        payload,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      setRoles((prevRoles) =>
        prevRoles.map((role) =>
          role._id === response.data._id ? response.data : role
        )
      );
      setSuccess(`Role "${response.data.name}" updated successfully`);
      setEditRole(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error updating role:', err);
      const errorMessage =
        err.response?.data?.errors?.map((e) => e.msg).join(', ') ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to update role';
      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Handle role deletion
  const handleDeleteRole = async (roleId, roleName) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"?`)) return;

    try {
      setError(null);
      await axios.delete(`${BASE_URL}/servers/${serverId}/roles/${roleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setRoles((prevRoles) => prevRoles.filter((role) => role._id !== roleId));
      setSuccess(`Role "${roleName}" deleted successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting role:', err);
      const errorMessage =
        err.response?.data?.error || err.response?.data?.message || 'Failed to delete role';
      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Handle assign role to member
  const handleAssignRole = async (roleId, userId, roleName, userName) => {
    // Validate parameters
    if (!roleId || !userId || !serverId) {
      setError('Invalid role, user, or server ID');
      console.error('Assign Role - Invalid parameters:', { serverId, roleId, userId });
      return;
    }

    // Check if role is already assigned
    const member = members.find((m) => m.user._id === userId);
    const hasRole = member?.roles?.some((r) => String(r._id) === String(roleId));
    if (hasRole) {
      setError(`Role "${roleName}" is already assigned to ${userName}`);
      console.warn('Assign Role - Role already assigned:', { roleId, userId });
      return;
    }

    console.log('Assign Role - Sending request:', {
      url: `${BASE_URL}/servers/${serverId}/roles/${roleId}/assign/${userId}`,
      roleId,
      userId,
      token: token ? 'Present' : 'Missing',
    });

    try {
      setError(null);
      const response = await axios.post(
        `${BASE_URL}/servers/${serverId}/roles/${roleId}/assign/${userId}`,
        {}, // Empty body as per backend
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Assign Role - Success:', response.data);
      // Refresh members to ensure latest role data
      const membersResponse = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers(membersResponse.data);
      if (selectedMember && selectedMember.user._id === userId) {
        setSelectedMember(membersResponse.data.find((m) => m.user._id === userId));
      }
      setSuccess(`Role "${roleName}" assigned to ${userName}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error assigning role:', err.response?.data || err.message);
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to assign role';
      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Handle remove role from member
  const handleRemoveRole = async (roleId, userId, roleName, userName) => {
    if (!confirm(`Are you sure you want to remove the role "${roleName}" from ${userName}?`)) return;

    // Validate parameters
    if (!roleId || !userId || !serverId) {
      setError('Invalid role, user, or server ID');
      console.error('Remove Role - Invalid parameters:', { serverId, roleId, userId });
      return;
    }

    // Check if role is assigned
    const member = members.find((m) => m.user._id === userId);
    const hasRole = member?.roles?.some((r) => String(r._id) === String(roleId));
    if (!hasRole) {
      setError(`Role "${roleName}" is not assigned to ${userName}`);
      console.warn('Remove Role - Role not assigned:', { roleId, userId });
      return;
    }

    console.log('Remove Role - Sending request:', {
      url: `${BASE_URL}/servers/${serverId}/roles/${roleId}/assign/${userId}`,
      roleId,
      userId,
      token: token ? 'Present' : 'Missing',
    });

    try {
      setError(null);
      const response = await axios.delete(
        `${BASE_URL}/servers/${serverId}/roles/${roleId}/assign/${userId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('Remove Role - Success:', response.data);
      // Refresh members to ensure latest role data
      const membersResponse = await axios.get(`${BASE_URL}/servers/${serverId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMembers(membersResponse.data);
      if (selectedMember && selectedMember.user._id === userId) {
        setSelectedMember(membersResponse.data.find((m) => m.user._id === userId));
      }
      setSuccess(`Role "${roleName}" removed from ${userName}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error removing role:', err.response?.data || err.message);
      const errorMessage =
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to remove role';
      setError(errorMessage);
      setSuccess(null);
    }
  };

  // Handle drag-and-drop role reordering
  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const currentSortedRoles = roles.sort((a, b) => b.position - a.position);
    const oldIndex = currentSortedRoles.findIndex((role) => role._id === active.id);
    const newIndex = currentSortedRoles.findIndex((role) => role._id === over.id);
    const newSortedRoles = arrayMove(currentSortedRoles, oldIndex, newIndex);

    const updatedSortedRoles = newSortedRoles
      .filter((role) => !role.isDefault)
      .map((role, index) => ({
        ...role,
        position: newSortedRoles.length - index,
      }));

    setRoles((prevRoles) =>
      prevRoles
        .map((role) => {
          const updated = updatedSortedRoles.find((u) => u._id === role._id);
          return updated || role;
        })
        .sort((a, b) => b.position - a.position)
    );

    try {
      setError(null);
      const payload = updatedSortedRoles.map((role) => ({
        id: role._id,
        position: Math.floor(Number(role.position)),
      }));

      if (!payload.length) {
        setError('No valid roles to reorder');
        return;
      }

      await axios.patch(
        `${BASE_URL}/servers/${serverId}/roles/reorder`,
        { roles: payload },
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );

      setSuccess('Roles reordered successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error reordering roles:', err);
      const errorMessage =
        err.response?.data?.errors?.map((e) => e.msg).join(', ') ||
        err.response?.data?.error ||
        err.response?.data?.message ||
        'Failed to reorder roles';
      setError(errorMessage);
      setSuccess(null);
      try {
        const rolesResponse = await axios.get(`${BASE_URL}/servers/${serverId}/roles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRoles(rolesResponse.data);
      } catch (fetchErr) {
        console.error('Error fetching roles after reorder failure:', fetchErr);
      }
    }
  };

  if (authLoading || loading) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Loading roles...</div>
      </div>
    );
  }

  if (!user || !server) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">Server not found or unauthorized</div>
      </div>
    );
  }

  if (!hasPermission) {
    return (
      <div style={{ backgroundColor: '#36393f', minHeight: '100vh' }} className="flex items-center justify-center">
        <div style={{ color: '#dcddde' }} className="text-lg">
          You do not have permission to manage roles in this server.
        </div>
      </div>
    );
  }

  const sortedRoles = roles.sort((a, b) => b.position - a.position);

  console.log('Roles Page - Debug:', {
    userId: user?.id,
    serverOwnerId: server?.owner?._id,
    isOwner: server?.owner?._id === user?.id,
    hasPermission,
    userRoles: members.find((m) => m.user._id === user?.id)?.roles,
    members: members.map((m) => ({
      id: m.user._id,
      username: m.user.username,
      roles: m.roles.map((r) => ({ id: r._id, name: r.name })), // Log role IDs and names
    })),
  });

  return (
    <div style={{ backgroundColor: '#36393f', minHeight: '100vh', padding: '1rem' }}>
      <ProfileSection />
      <div style={{ maxWidth: 'calc(100% - 14rem)', margin: '0 auto', paddingTop: '4rem' }}>
        <div className="flex justify-between items-center mb-6">
          <h2 style={{ color: '#dcddde' }} className="text-2xl font-bold">
            Manage Roles - {server.name}
            {server.owner?._id === user?.id && ' (Owner)'}
          </h2>
          <div style={{ color: '#b9bbbe' }} className="text-sm">
            {roles.length} role{roles.length !== 1 ? 's' : ''} | {members.length} member{members.length !== 1 ? 's' : ''}
          </div>
        </div>

        {error && (
          <div style={{ backgroundColor: '#f04747', borderColor: '#d83c3c' }} className="mb-4 p-3 border rounded-md">
            <p style={{ color: '#ffffff' }} className="text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div style={{ backgroundColor: '#43b581', borderColor: '#3a9e6f' }} className="mb-4 p-3 border rounded-md">
            <p style={{ color: '#ffffff' }} className="text-sm">{success}</p>
          </div>
        )}

        {/* Create Role Form */}
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
          <h3 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
            Create New Role
          </h3>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-1">
                Role Name *
              </label>
              <input
                type="text"
                name="name"
                value={newRole.name}
                onChange={(e) => handleInputChange(e, setNewRole)}
                style={{ backgroundColor: '#202225', color: '#dcddde', border: '1px solid #40444b' }}
                className="mt-1 block w-full rounded-md px-3 py-2 focus:ring-2 focus:ring-[#5865f2] focus:border-transparent"
                placeholder="Enter role name"
                required
                maxLength={100}
              />
            </div>

            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-1">
                Role Color
              </label>
              <input
                type="color"
                name="color"
                value={newRole.color}
                onChange={(e) => handleInputChange(e, setNewRole)}
                className="w-full h-10 rounded-md border border-[#40444b]"
              />
              <p style={{ color: '#72767d' }} className="text-xs mt-1">
                Default: #99AAB5
              </p>
            </div>

            <div>
              <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-2">
                Permissions ({newRole.permissions.length} selected)
              </label>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="space-y-2">
                {permissions.map((permission) => (
                  <label key={permission} className="flex items-center p-2 hover:bg-[#40444b] rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newRole.permissions.includes(permission)}
                      onChange={() => handlePermissionChange(permission, setNewRole)}
                      className="mr-3 rounded"
                    />
                    <span style={{ color: '#dcddde' }} className="text-sm">
                      {permission.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="flex items-center" style={{ color: '#b9bbbe' }}>
                  <input
                    type="checkbox"
                    name="hoist"
                    checked={newRole.hoist}
                    onChange={(e) => handleInputChange(e, setNewRole)}
                    className="mr-2 rounded"
                  />
                  <span className="text-sm">Display role members separately (Hoisted)</span>
                </label>
              </div>
              <div>
                <label className="flex items-center" style={{ color: '#b9bbbe' }}>
                  <input
                    type="checkbox"
                    name="mentionable"
                    checked={newRole.mentionable}
                    onChange={(e) => handleInputChange(e, setNewRole)}
                    className="mr-2 rounded"
                  />
                  <span className="text-sm">Allow anyone to @mention this role</span>
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={!newRole.name.trim()}
              style={{
                backgroundColor: newRole.name.trim() ? '#5865f2' : '#40444b',
                color: '#ffffff',
              }}
              className="w-full py-2 px-4 rounded-md hover:bg-blue-600 disabled:cursor-not-allowed transition-colors"
            >
              Create Role
            </button>
          </form>
        </div>

        {/* Edit Role Modal */}
        {editRole && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div style={{ backgroundColor: '#2f3136', width: '500px' }} className="p-6 rounded-lg shadow-md">
              <h3 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
                Edit Role - {editRole.name}
              </h3>
              <form onSubmit={handleEditSubmit} className="space-y-4">
                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-1">
                    Role Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={editRole.name}
                    onChange={(e) => handleInputChange(e, setEditRole)}
                    style={{ backgroundColor: '#202225', color: '#dcddde', border: '1px solid #40444b' }}
                    className="mt-1 block w-full rounded-md px-3 py-2 focus:ring-2 focus:ring-[#5865f2] focus:border-transparent"
                    placeholder="Enter role name"
                    required
                    maxLength={100}
                  />
                </div>

                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-1">
                    Role Color
                  </label>
                  <input
                    type="color"
                    name="color"
                    value={editRole.color}
                    onChange={(e) => handleInputChange(e, setEditRole)}
                    className="w-full h-10 rounded-md border border-[#40444b]"
                  />
                  <p style={{ color: '#72767d' }} className="text-xs mt-1">
                    Default: #99AAB5
                  </p>
                </div>

                <div>
                  <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-2">
                    Permissions ({editRole.permissions.length} selected)
                  </label>
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="space-y-2">
                    {permissions.map((permission) => (
                      <label key={permission} className="flex items-center p-2 hover:bg-[#40444b] rounded cursor-pointer">
                        <input
                          type="checkbox"
                          checked={editRole.permissions.includes(permission)}
                          onChange={() => handlePermissionChange(permission, setEditRole)}
                          disabled={editRole.isDefault}
                          className="mr-3 rounded"
                        />
                        <span style={{ color: editRole.isDefault ? '#72767d' : '#dcddde' }} className="text-sm">
                          {permission.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                        </span>
                      </label>
                    ))}
                  </div>
                  {editRole.isDefault && (
                    <p style={{ color: '#72767d' }} className="text-xs mt-2">
                      Permissions for @everyone cannot be modified.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center" style={{ color: '#b9bbbe' }}>
                      <input
                        type="checkbox"
                        name="hoist"
                        checked={editRole.hoist}
                        onChange={(e) => handleInputChange(e, setEditRole)}
                        className="mr-2 rounded"
                      />
                      <span className="text-sm">Display role members separately (Hoisted)</span>
                    </label>
                  </div>
                  <div>
                    <label className="flex items-center" style={{ color: '#b9bbbe' }}>
                      <input
                        type="checkbox"
                        name="mentionable"
                        checked={editRole.mentionable}
                        onChange={(e) => handleInputChange(e, setEditRole)}
                        className="mr-2 rounded"
                      />
                      <span className="text-sm">Allow anyone to @mention this role</span>
                    </label>
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setEditRole(null)}
                    style={{ backgroundColor: '#72767d', color: '#ffffff' }}
                    className="py-2 px-4 rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!editRole.name.trim()}
                    style={{
                      backgroundColor: editRole.name.trim() ? '#5865f2' : '#40444b',
                      color: '#ffffff',
                    }}
                    className="py-2 px-4 rounded-md hover:bg-blue-600 disabled:cursor-not-allowed transition-colors"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Roles List with Drag-and-Drop */}
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
          <h3 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
            Server Roles ({roles.length})
          </h3>

          {roles.length === 0 ? (
            <div style={{ color: '#72767d' }} className="text-center py-8">
              <p>No roles found. Create your first role above!</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={sortedRoles.map((role) => role._id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {sortedRoles.map((role) => (
                    <SortableRoleItem key={role._id} role={role} permissions={permissions} onEdit={setEditRole} onDelete={handleDeleteRole} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Member Role Management */}
        <div style={{ backgroundColor: '#2f3136' }} className="p-6 rounded-lg shadow-md mb-8">
          <h3 style={{ color: '#dcddde' }} className="text-xl font-semibold mb-4">
            Manage Member Roles
          </h3>
          <div className="mb-4">
            <label style={{ color: '#b9bbbe' }} className="block text-sm font-medium mb-1">
              Select Member
            </label>
            <select
              value={selectedMember?.user._id || ''}
              onChange={(e) => {
                const member = members.find((m) => m.user._id === e.target.value);
                setSelectedMember(member || null);
                console.log('Selected Member:', {
                  userId: member?.user._id,
                  username: member?.user.username,
                  roles: member?.roles?.map((r) => ({ id: r._id, name: r.name })),
                });
              }}
              style={{ backgroundColor: '#202225', color: '#dcddde', border: '1px solid #40444b' }}
              className="mt-1 block w-full rounded-md px-3 py-2 focus:ring-2 focus:ring-[#5865f2] focus:border-transparent"
            >
              <option value="" style={{ color: '#72767d' }}>
                Select a member
              </option>
              {members.map((member) => (
                <option key={member.user._id} value={member.user._id}>
                  {member.user.displayName || member.user.username}
                </option>
              ))}
            </select>
          </div>

          {selectedMember && (
            <div>
              <h4 style={{ color: '#dcddde' }} className="text-lg font-semibold mb-2">
                Roles for {selectedMember.user.displayName || selectedMember.user.username}
              </h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }} className="space-y-2">
                {sortedRoles
                  .filter((role) => !role.isDefault)
                  .map((role) => {
                    const hasRole = selectedMember.roles?.some((r) => String(r._id) === String(role._id)) || false;
                    console.log('Role Check:', {
                      roleId: role._id,
                      roleName: role.name,
                      userId: selectedMember.user._id,
                      hasRole,
                      memberRoles: selectedMember.roles?.map((r) => ({ id: r._id, name: r.name })),
                    });
                    return (
                      <div
                        key={role._id}
                        className="flex items-center justify-between p-2 hover:bg-[#40444b] rounded"
                      >
                        <span style={{ color: '#dcddde' }} className="text-sm">
                          {role.name}
                        </span>
                        <button
                          onClick={() =>
                            hasRole
                              ? handleRemoveRole(
                                  role._id,
                                  selectedMember.user._id,
                                  role.name,
                                  selectedMember.user.displayName || selectedMember.user.username
                                )
                              : handleAssignRole(
                                  role._id,
                                  selectedMember.user._id,
                                  role.name,
                                  selectedMember.user.displayName || selectedMember.user.username
                                )
                          }
                          style={{
                            backgroundColor: hasRole ? '#ed4245' : '#5865f2',
                            color: '#ffffff',
                            padding: '0.25rem 0.75rem',
                            borderRadius: '3px',
                            fontSize: '12px',
                          }}
                          className="hover:bg-opacity-80 transition-colors whitespace-nowrap"
                          disabled={role.isDefault}
                        >
                          {hasRole ? 'Remove' : 'Assign'}
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        {/* Backend Alignment Note */}
        <div style={{ backgroundColor: '#2f3136', border: '1px solid #40444b' }} className="p-4 rounded-lg">
          <h4 style={{ color: '#dcddde' }} className="font-semibold mb-2">Backend Notes:</h4>
          <ul style={{ color: '#b9bbbe', fontSize: '14px' }} className="space-y-1">
            <li>• Owner always has all permissions</li>
            <li>• <code>ADMINISTRATOR</code> permission grants all permissions</li>
            <li>• <code>MANAGE_ROLES</code> required to create, edit, delete, reorder, or assign roles</li>
            <li>• New roles get highest position automatically</li>
            <li>• Socket events emitted for real-time updates</li>
            <li>• @everyone role cannot be deleted or have permissions modified</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// Sortable Role Item Component
function SortableRoleItem({ role, permissions, onEdit, onDelete }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: role._id, disabled: role.isDefault });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const colorHex = role.color
    ? '#' + role.color.toString(16).padStart(6, '0').toUpperCase()
    : '#99AAB5';

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: '#202225',
        borderLeft: `4px solid ${colorHex}`,
        borderRadius: '0 4px 4px 0',
      }}
      className={`p-4 rounded flex items-center justify-between hover:bg-[#36393f] transition-colors ${isDragging ? 'ring-2 ring-[#5865f2]' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="flex-1">
        <div className="flex items-center mb-1">
          <span
            style={{ color: colorHex !== '#000000' ? colorHex : '#ffffff' }}
            className="font-semibold text-sm mr-2"
          >
            {role.name}
          </span>
          <span style={{ color: '#72767d' }} className="text-xs">
            Position: {role.position || 0}
          </span>
        </div>
        <div style={{ color: '#b9bbbe' }} className="text-xs mb-1">
          {role.permissions?.length > 0 ? (
            <>
              Permissions: {role.permissions.slice(0, 3).join(', ')}
              {role.permissions.length > 3 && ` +${role.permissions.length - 3} more`}
            </>
          ) : (
            'No permissions'
          )}
        </div>
        <div style={{ color: '#72767d' }} className="text-xs">
          <span>Members: {role.memberCount || 0}</span>
          {' • '}
          <span>Hoisted: {role.hoist ? 'Yes' : 'No'}</span>
          {' • '}
          <span>Mentionable: {role.mentionable ? 'Yes' : 'No'}</span>
          {role.isDefault && <span style={{ color: '#43b581' }}> • Everyone</span>}
        </div>
      </div>
      {!role.isDefault && (
        <div className="flex space-x-2">
          <button
            onClick={() =>
              onEdit({
                ...role,
                originalName: role.name,
                originalColor: role.color,
                originalPermissions: role.permissions || [],
                originalHoist: role.hoist || false,
                originalMentionable: role.mentionable || false,
              })
            }
            style={{
              backgroundColor: '#5865f2',
              color: '#ffffff',
              padding: '0.25rem 0.75rem',
              borderRadius: '3px',
              fontSize: '12px',
            }}
            className="hover:bg-blue-600 transition-colors whitespace-nowrap"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(role._id, role.name)}
            style={{
              backgroundColor: '#ed4245',
              color: '#ffffff',
              padding: '0.25rem 0.75rem',
              borderRadius: '3px',
              fontSize: '12px',
            }}
            className="hover:bg-red-600 transition-colors whitespace-nowrap"
          >
            Delete
          </button>
        </div>
      )}
      {role.isDefault && <span style={{ color: '#72767d' }} className="text-xs ml-auto">Default</span>}
    </div>
  );
}
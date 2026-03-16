import React, { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, Users, Search, Shield, ShieldCheck, UserX, UserCheck, 
  Trash2, Loader2, RefreshCw, ChevronDown, MessageSquare
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getAdminUsers, updateAdminUser, deleteAdminUser } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const UserManagement = ({ onBack }) => {
  const { t, lang } = useLanguage();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAdminUsers(search, roleFilter);
      setUsers(data.data || []);
      setTotal(data.total || 0);
    } catch {
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, [search, roleFilter]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleToggleRole = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    setActionLoading(user.user_id);
    try {
      await updateAdminUser(user.user_id, { role: newRole });
      setUsers(prev => prev.map(u => 
        u.user_id === user.user_id ? { ...u, role: newRole } : u
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleActive = async (user) => {
    setActionLoading(user.user_id);
    try {
      await updateAdminUser(user.user_id, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => 
        u.user_id === user.user_id ? { ...u, is_active: !u.is_active } : u
      ));
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId) => {
    setActionLoading(userId);
    try {
      await deleteAdminUser(userId);
      setUsers(prev => prev.filter(u => u.user_id !== userId));
      setTotal(prev => prev - 1);
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(null);
      setShowDeleteConfirm(null);
    }
  };

  const formatDate = (iso) => {
    const d = new Date(iso);
    const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };
    return d.toLocaleDateString(localeMap[lang] || 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const adminCount = users.filter(u => u.role === 'admin').length;
  const activeCount = users.filter(u => u.is_active).length;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <Users className="w-6 h-6 text-[#0E3B8C]" />
              <h1 className="text-xl font-bold text-slate-800">{t('userMgmtTitle')}</h1>
            </div>
          </div>
          <button
            onClick={loadUsers}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('refresh')}
          >
            <RefreshCw className={cn("w-5 h-5 text-slate-500", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="px-6 pt-5 pb-2 flex-shrink-0">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{total}</p>
                <p className="text-xs text-slate-500">{t('totalUsers')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 rounded-lg">
                <ShieldCheck className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{adminCount}</p>
                <p className="text-xs text-slate-500">{t('admin')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <UserCheck className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{activeCount}</p>
                <p className="text-xs text-slate-500">{t('active')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]"
            />
          </div>
          <div className="relative">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="appearance-none bg-white border border-slate-200 rounded-lg px-4 py-2.5 pr-9 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] cursor-pointer"
            >
              <option value="">{t('allRoles')}</option>
              <option value="admin">{t('admin')}</option>
              <option value="user">User</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* User Table */}
      <div className="flex-1 px-6 pb-6 overflow-auto">
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-[#0E3B8C] animate-spin" />
              <span className="ml-2 text-slate-500">{t('loading')}</span>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-20 text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>{t('noUsersFound')}</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('user')}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('role')}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('status')}</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <MessageSquare className="w-4 h-4 inline" />
                  </th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('createdAt')}</th>
                  <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm flex-shrink-0",
                          u.role === 'admin' 
                            ? "bg-gradient-to-tr from-purple-500 to-indigo-500" 
                            : "bg-gradient-to-tr from-blue-500 to-cyan-500"
                        )}>
                          {u.name?.charAt(0)?.toUpperCase() || u.email?.charAt(0)?.toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{u.name || t('noName')}</p>
                          <p className="text-xs text-slate-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        u.role === 'admin' 
                          ? "bg-purple-50 text-purple-700 border border-purple-200" 
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      )}>
                        {u.role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {u.role === 'admin' ? t('admin') : 'User'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
                        u.is_active 
                          ? "bg-green-50 text-green-700 border border-green-200" 
                          : "bg-red-50 text-red-600 border border-red-200"
                      )}>
                        <span className={cn("w-1.5 h-1.5 rounded-full", u.is_active ? "bg-green-500" : "bg-red-400")} />
                        {u.is_active ? t('activeStatus') : t('lockedStatus')}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-center">
                      <span className="text-sm text-slate-500">{u.conversation_count}</span>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="text-sm text-slate-500">{formatDate(u.created_at)}</span>
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleToggleRole(u)}
                          disabled={actionLoading === u.user_id}
                          className={cn(
                            "p-2 rounded-lg text-xs font-medium transition-all",
                            u.role === 'admin'
                              ? "hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                              : "hover:bg-purple-50 text-purple-500 hover:text-purple-700"
                          )}
                          title={u.role === 'admin' ? t('demoteToUser') : t('promoteToAdmin')}
                        >
                          {actionLoading === u.user_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : u.role === 'admin' ? (
                            <Shield className="w-4 h-4" />
                          ) : (
                            <ShieldCheck className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={actionLoading === u.user_id}
                          className={cn(
                            "p-2 rounded-lg transition-all",
                            u.is_active
                              ? "hover:bg-orange-50 text-orange-500 hover:text-orange-700"
                              : "hover:bg-green-50 text-green-500 hover:text-green-700"
                          )}
                          title={u.is_active ? t('lockAccount') : t('unlockAccount')}
                        >
                          {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>

                        <div className="relative">
                          <button
                            onClick={() => setShowDeleteConfirm(showDeleteConfirm === u.user_id ? null : u.user_id)}
                            disabled={actionLoading === u.user_id}
                            className="p-2 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-all"
                            title={t('deleteAccount')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {showDeleteConfirm === u.user_id && (
                            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-3">
                              <p className="text-sm text-slate-700 mb-3">
                                {t('deleteConfirm')} <strong>{u.name || u.email}</strong>?
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setShowDeleteConfirm(null)}
                                  className="flex-1 px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                                >
                                  {t('cancel')}
                                </button>
                                <button
                                  onClick={() => handleDelete(u.user_id)}
                                  className="flex-1 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                  {actionLoading === u.user_id ? t('deleting') : t('delete')}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-40" onClick={() => setShowDeleteConfirm(null)} />
      )}
    </div>
  );
};

export default UserManagement;

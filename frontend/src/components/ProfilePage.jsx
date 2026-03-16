import React, { useState } from 'react';
import { 
  ArrowLeft, User, Mail, Shield, Calendar, Pencil, Check, X, 
  Lock, Eye, EyeOff, Loader2, ShieldCheck, Globe
} from 'lucide-react';
import { cn } from '../lib/utils';
import { updateProfile, changePassword } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../i18n';

const ProfilePage = ({ user, onBack, onUserUpdate }) => {
  const { t, lang, changeLang } = useLanguage();

  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [message, setMessage] = useState(null);

  const showMessage = (text, type = 'success') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleSaveName = async () => {
    if (!newName.trim()) return;
    setSavingName(true);
    try {
      const data = await updateProfile(newName.trim());
      onUserUpdate({ ...user, name: data.name });
      setIsEditingName(false);
      showMessage(t('nameUpdated'));
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showMessage(t('errPasswordMin'), 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showMessage(t('errPasswordMismatch'), 'error');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      showMessage(t('passwordChanged'));
      setShowPasswordForm(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };
    return d.toLocaleDateString(localeMap[lang] || 'vi-VN', { 
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-xl font-bold text-slate-800">{t('profileTitle')}</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">

          {/* Toast message */}
          {message && (
            <div className={cn(
              "px-4 py-3 rounded-xl text-sm font-medium border",
              message.type === 'error' 
                ? "bg-red-50 text-red-700 border-red-200" 
                : "bg-green-50 text-green-700 border-green-200"
            )}>
              {message.text}
            </div>
          )}

          {/* Avatar + Name */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4",
                user?.role === 'admin'
                  ? "bg-gradient-to-tr from-purple-500 to-indigo-500"
                  : "bg-gradient-to-tr from-blue-500 to-cyan-500"
              )}>
                {user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U'}
              </div>

              {/* Name editing */}
              {isEditingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') { setIsEditingName(false); setNewName(user?.name || ''); }
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                  >
                    {savingName ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => { setIsEditingName(false); setNewName(user?.name || ''); }}
                    className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-xl font-bold text-slate-800">{user?.name || t('noName')}</h2>
                  <button
                    onClick={() => { setIsEditingName(true); setNewName(user?.name || ''); }}
                    className="p-1.5 text-slate-400 hover:text-[#0E3B8C] hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Role badge */}
              <span className={cn(
                "mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium",
                user?.role === 'admin'
                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              )}>
                {user?.role === 'admin' ? <ShieldCheck className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                {user?.role === 'admin' ? t('admin') : t('user')}
              </span>
            </div>
          </div>

          {/* Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">{t('accountInfo')}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              <div className="flex items-center gap-4 px-6 py-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Mail className="w-4 h-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5">{t('email')}</p>
                  <p className="text-sm font-medium text-slate-700">{user?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 px-6 py-4">
                <div className="p-2 bg-green-50 rounded-lg">
                  <User className="w-4 h-4 text-green-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5">User ID</p>
                  <p className="text-sm font-medium text-slate-700 font-mono">{user?.user_id}</p>
                </div>
              </div>
              {user?.created_at && (
                <div className="flex items-center gap-4 px-6 py-4">
                  <div className="p-2 bg-orange-50 rounded-lg">
                    <Calendar className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-0.5">{t('createdAt')}</p>
                    <p className="text-sm font-medium text-slate-700">{formatDate(user.created_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Language Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">{t('language')}</h3>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Globe className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{t('language')}</p>
                  <p className="text-xs text-slate-400">{t('languageDesc')}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((l) => (
                  <button
                    key={l.code}
                    onClick={() => changeLang(l.code)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                      lang === l.code
                        ? "border-[#0E3B8C] bg-blue-50 text-[#0E3B8C] shadow-sm"
                        : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span className="text-lg">{l.flag}</span>
                    <span>{l.label}</span>
                    {lang === l.code && <Check className="w-4 h-4 ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">{t('security')}</h3>
            </div>
            <div className="px-6 py-4">
              {!showPasswordForm ? (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="flex items-center gap-3 px-4 py-3 w-full rounded-xl border border-slate-200 hover:border-[#0E3B8C] hover:bg-blue-50/50 transition-all group"
                >
                  <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                    <Lock className="w-4 h-4 text-slate-500 group-hover:text-[#0E3B8C]" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-sm font-medium text-slate-700">{t('changePassword')}</p>
                    <p className="text-xs text-slate-400">{t('changePasswordDesc')}</p>
                  </div>
                </button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('currentPassword')}</label>
                    <div className="relative">
                      <input
                        type={showCurrent ? 'text' : 'password'}
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]"
                        required
                      />
                      <button type="button" onClick={() => setShowCurrent(!showCurrent)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('newPassword')}</label>
                    <div className="relative">
                      <input
                        type={showNew ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]"
                        required
                        minLength={6}
                      />
                      <button type="button" onClick={() => setShowNew(!showNew)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t('confirmNewPassword')}</label>
                    <div className="relative">
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]"
                        required
                        minLength={6}
                      />
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                      className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
                    >
                      {t('cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={savingPassword}
                      className={cn(
                        "flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white flex items-center justify-center gap-2",
                        savingPassword ? "bg-slate-400" : "bg-[#0E3B8C] hover:bg-blue-800"
                      )}
                    >
                      {savingPassword ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> {t('saving')}</>
                      ) : (
                        t('changePassword')
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

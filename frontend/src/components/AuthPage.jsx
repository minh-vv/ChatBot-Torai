import React, { useState } from 'react';
import { FileText, Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { login, register } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { LANGUAGES } from '../i18n';

const AuthPage = ({ onAuthSuccess }) => {
  const { t, lang, changeLang } = useLanguage();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim()) {
      setError(t('errEmailRequired'));
      return;
    }
    
    if (!password) {
      setError(t('errPasswordRequired'));
      return;
    }
    
    if (!isLogin) {
      if (password.length < 6) {
        setError(t('errPasswordMin'));
        return;
      }
      
      if (password !== confirmPassword) {
        setError(t('errPasswordMismatch'));
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      let userData;
      if (isLogin) {
        userData = await login(email, password);
      } else {
        userData = await register(email, password, name);
      }
      
      onAuthSuccess(userData);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Language Switcher */}
        <div className="flex justify-center gap-1 mb-6">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => changeLang(l.code)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all",
                lang === l.code
                  ? "bg-[#0E3B8C] text-white shadow"
                  : "bg-white text-slate-500 hover:text-slate-700 border border-slate-200"
              )}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>

        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="bg-[#0E3B8C] p-3 rounded-xl shadow-lg mb-4">
            <FileText className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">ChatBot</h1>
          <p className="text-slate-500 mt-1">{t('authSubtitle')}</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
          <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">
            {isLogin ? t('login') : t('registerTitle')}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('fullName')}
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('fullNamePlaceholder')}
                    className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] transition-all text-sm"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('email')}
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] transition-all text-sm"
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                {t('password')}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] transition-all text-sm"
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  {t('confirmPassword')}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-11 pr-11 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C] transition-all text-sm"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                "w-full py-3 rounded-xl font-medium text-white flex items-center justify-center gap-2 transition-all",
                isLoading 
                  ? "bg-slate-400 cursor-not-allowed" 
                  : "bg-[#0E3B8C] hover:bg-blue-800 shadow-lg hover:shadow-xl"
              )}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{t('processing')}</span>
                </>
              ) : (
                <>
                  <span>{isLogin ? t('login') : t('register')}</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600 text-sm">
              {isLogin ? t('noAccount') : t('hasAccount')}
              <button
                type="button"
                onClick={switchMode}
                className="ml-1 text-[#0E3B8C] font-medium hover:underline"
              >
                {isLogin ? t('registerNow') : t('login')}
              </button>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          © 2024 ChatBot. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default AuthPage;

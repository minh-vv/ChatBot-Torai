import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, ThumbsUp, ThumbsDown, Search, Loader2, RefreshCw,
  Trash2, MessageSquare, ChevronDown, User, BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import { getAdminFeedbacks, deleteAdminFeedback } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const FeedbackManagement = ({ onBack }) => {
  const { t, lang } = useLanguage();

  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState({ total: 0, likes: 0, dislikes: 0 });
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [ratingFilter, setRatingFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };

  const loadFeedbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getAdminFeedbacks(ratingFilter, searchQuery, userFilter);
      setFeedbacks(data.feedbacks || []);
      setStats(data.stats || { total: 0, likes: 0, dislikes: 0 });
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading feedbacks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter, searchQuery, userFilter]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  const handleDelete = async (feedbackId) => {
    if (!window.confirm(t('deleteFeedbackConfirm'))) return;
    try {
      await deleteAdminFeedback(feedbackId);
      setFeedbacks(prev => prev.filter(fb => fb.id !== feedbackId));
      setStats(prev => {
        const deleted = feedbacks.find(fb => fb.id === feedbackId);
        if (!deleted) return prev;
        return {
          total: prev.total - 1,
          likes: prev.likes - (deleted.rating === 'like' ? 1 : 0),
          dislikes: prev.dislikes - (deleted.rating === 'dislike' ? 1 : 0),
        };
      });
    } catch (error) {
      console.error('Error deleting feedback:', error);
    }
  };

  const satisfactionRate = stats.total > 0
    ? Math.round((stats.likes / stats.total) * 100)
    : 0;

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-[#0E3B8C]" />
              <div>
                <h1 className="text-xl font-bold text-slate-800">{t('feedbackMgmt')}</h1>
                <p className="text-xs text-slate-500">{t('feedbackSubtitle')}</p>
              </div>
            </div>
          </div>
          <button onClick={loadFeedbacks} className="p-2 hover:bg-slate-100 rounded-lg transition-colors" title={t('refresh')}>
            <RefreshCw className={cn("w-5 h-5 text-slate-500", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="px-6 pt-5 pb-2 flex-shrink-0">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <MessageSquare className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.total}</p>
                <p className="text-xs text-slate-500">{t('totalFeedback')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <ThumbsUp className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.likes}</p>
                <p className="text-xs text-slate-500">{t('likes')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-50 rounded-lg">
                <ThumbsDown className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{stats.dislikes}</p>
                <p className="text-xs text-slate-500">{t('dislikes')}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 rounded-lg">
                <BarChart3 className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{satisfactionRate}%</p>
                <p className="text-xs text-slate-500">{t('satisfactionRate')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('searchFeedback')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] focus:border-transparent"
            />
          </div>

          <div className="relative">
            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer"
            >
              <option value="">{t('allFeedback')}</option>
              <option value="like">{t('likesOnly')}</option>
              <option value="dislike">{t('dislikesOnly')}</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer max-w-[200px]"
            >
              <option value="">{t('allUsers')}</option>
              {users.map(u => (
                <option key={u.user_id} value={u.user_id}>{u.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Feedback List */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <MessageSquare className="w-16 h-16 mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-500">{t('noFeedbackYet')}</p>
            <p className="text-sm mt-1">{t('noFeedbackDesc')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {feedbacks.map((fb) => (
              <div
                key={fb.id}
                className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-sm transition-shadow"
              >
                {/* Feedback Header */}
                <div
                  className="flex items-center gap-4 px-5 py-3.5 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                >
                  {/* Rating icon */}
                  <div className={cn(
                    "p-2 rounded-lg flex-shrink-0",
                    fb.rating === 'like' ? "bg-green-50" : "bg-red-50"
                  )}>
                    {fb.rating === 'like'
                      ? <ThumbsUp className="w-4 h-4 text-green-600" />
                      : <ThumbsDown className="w-4 h-4 text-red-500" />
                    }
                  </div>

                  {/* Question preview */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {fb.query || t('noQuestionData')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {fb.user_name}
                      </span>
                      <span className="text-xs text-slate-300">•</span>
                      <span className="text-xs text-slate-400">
                        {new Date(fb.created_at).toLocaleDateString(localeMap[lang] || 'vi-VN', {
                          year: 'numeric', month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                      {fb.comment && (
                        <>
                          <span className="text-xs text-slate-300">•</span>
                          <span className="text-xs text-blue-500 flex items-center gap-0.5">
                            <MessageSquare className="w-3 h-3" />
                            {t('comment')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Rating badge */}
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0",
                    fb.rating === 'like'
                      ? "bg-green-50 text-green-700 border border-green-100"
                      : "bg-red-50 text-red-700 border border-red-100"
                  )}>
                    {fb.rating === 'like' ? t('like') : t('dislike')}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(fb.id); }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title={t('delete')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {/* Expand chevron */}
                  <ChevronDown className={cn(
                    "w-4 h-4 text-slate-400 transition-transform flex-shrink-0",
                    expandedId === fb.id && "rotate-180"
                  )} />
                </div>

                {/* Expanded Detail */}
                {expandedId === fb.id && (
                  <div className="border-t border-slate-100 px-5 py-4 space-y-3 bg-slate-50/50">
                    {/* User question */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('question')}</p>
                      <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {fb.query || t('noQuestionData')}
                        </p>
                      </div>
                    </div>

                    {/* AI answer */}
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('aiAnswer')}</p>
                      <div className="bg-blue-50/50 rounded-lg border border-blue-100 px-4 py-3">
                        <p className="text-sm text-slate-700 whitespace-pre-wrap">
                          {fb.answer || t('noQuestionData')}
                        </p>
                      </div>
                    </div>

                    {/* Comment */}
                    {fb.comment && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{t('comment')}</p>
                        <div className="bg-amber-50/50 rounded-lg border border-amber-100 px-4 py-3">
                          <p className="text-sm text-slate-700 whitespace-pre-wrap">{fb.comment}</p>
                        </div>
                      </div>
                    )}

                    {/* Meta info */}
                    <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                      <span>{t('email')}: {fb.user_email || '—'}</span>
                      <span>Message ID: {fb.message_id?.slice(0, 16)}...</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackManagement;

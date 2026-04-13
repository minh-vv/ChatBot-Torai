import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft, ThumbsUp, ThumbsDown, Search, Loader2, RefreshCw,
  Trash2, MessageSquare, ChevronDown, User, BarChart3, Calendar, CalendarRange, X,
  TrendingUp, BarChart2, Settings, Plus, RotateCcw, GripVertical
} from 'lucide-react';
import { FEEDBACK_OPTIONS_KEY, DEFAULT_FEEDBACK_OPTIONS } from './ChatInterface';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import { cn } from '../lib/utils';
import { getAdminFeedbacks, deleteAdminFeedback } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';

const dedupeByUserId = (arr) => {
  const seen = new Set();
  return (arr || []).filter((u) => {
    const id = u?.user_id;
    if (!id) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const FeedbackManagement = ({ onBack }) => {
  const { t, lang } = useLanguage();

  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState({ total: 0, likes: 0, dislikes: 0 });
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const [ratingFilter, setRatingFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Date filter state
  const [dateMode, setDateMode] = useState('all'); // 'all' | 'until' | 'range'
  const [untilDate, setUntilDate] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Chart state
  const [chartType, setChartType] = useState('bar'); // 'bar' | 'line'
  const [groupBy, setGroupBy] = useState('day');     // 'day' | 'week' | 'month'

  // ── Feedback Options Config ──
  const getStoredOptions = () => {
    try {
      const stored = localStorage.getItem(FEEDBACK_OPTIONS_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_FEEDBACK_OPTIONS;
    } catch { return DEFAULT_FEEDBACK_OPTIONS; }
  };

  const [showConfigModal, setShowConfigModal] = useState(false);
  const [configTab, setConfigTab]             = useState('like');
  const [configDraft, setConfigDraft]         = useState(null);
  const [newTagInputs, setNewTagInputs]       = useState({});

  const openConfigModal = () => {
    setConfigDraft(JSON.parse(JSON.stringify(getStoredOptions())));
    setConfigTab('like');
    setNewTagInputs({});
    setShowConfigModal(true);
  };

  const saveConfig = () => {
    localStorage.setItem(FEEDBACK_OPTIONS_KEY, JSON.stringify(configDraft));
    setShowConfigModal(false);
  };

  const resetConfig = () => setConfigDraft(JSON.parse(JSON.stringify(DEFAULT_FEEDBACK_OPTIONS)));

  const updateCategoryName = (type, idx, value) =>
    setConfigDraft(prev => ({
      ...prev,
      [type]: prev[type].map((cat, i) => i === idx ? { ...cat, category: value } : cat)
    }));

  const removeTag = (type, catIdx, tagIdx) =>
    setConfigDraft(prev => ({
      ...prev,
      [type]: prev[type].map((cat, i) =>
        i === catIdx ? { ...cat, tags: cat.tags.filter((_, ti) => ti !== tagIdx) } : cat
      )
    }));

  const addTag = (type, catIdx) => {
    const key = `${type}-${catIdx}`;
    const tag = (newTagInputs[key] || '').trim();
    if (!tag) return;
    setConfigDraft(prev => ({
      ...prev,
      [type]: prev[type].map((cat, i) =>
        i === catIdx ? { ...cat, tags: [...cat.tags, tag] } : cat
      )
    }));
    setNewTagInputs(prev => ({ ...prev, [key]: '' }));
  };

  const addCategory = (type) =>
    setConfigDraft(prev => ({
      ...prev,
      [type]: [...prev[type], { category: 'New Category', tags: [] }]
    }));

  const removeCategory = (type, idx) =>
    setConfigDraft(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== idx)
    }));

  const localeMap = { vi: 'vi-VN', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' };

  // Parse comment field: "Tag1, Tag2 | extra comment text"
  const parseFeedbackComment = (comment) => {
    if (!comment) return { tags: [], extraComment: '' };
    const pipeIdx = comment.indexOf(' | ');
    if (pipeIdx !== -1) {
      const tags = comment.slice(0, pipeIdx).split(', ').map(t => t.trim()).filter(Boolean);
      const extraComment = comment.slice(pipeIdx + 3).trim();
      return { tags, extraComment };
    }
    const segments = comment.split(', ').map(t => t.trim()).filter(Boolean);
    if (segments.length > 0 && segments.every(s => s.length <= 32)) {
      return { tags: segments, extraComment: '' };
    }
    return { tags: [], extraComment: comment };
  };

  // Group flat tag list into [{category, tags}] using stored options config
  const groupTagsByCategory = (tags, ratingType) => {
    if (!tags || tags.length === 0) return [];
    const options = getStoredOptions();
    const categories = options[ratingType] || [];
    const tagSet = new Set(tags);
    const grouped = [];
    const matched = new Set();

    for (const { category, tags: catTags } of categories) {
      const hits = catTags.filter(t => tagSet.has(t));
      if (hits.length > 0) {
        grouped.push({ category, tags: hits });
        hits.forEach(t => matched.add(t));
      }
    }
    // Tags not matched to any category (e.g. custom / old config)
    const uncategorized = tags.filter(t => !matched.has(t));
    if (uncategorized.length > 0) {
      grouped.push({ category: 'Other', tags: uncategorized });
    }
    return grouped;
  };

  const formatChartDate = useCallback((key, mode) => {
    if (mode === 'month') {
      const [y, m] = key.split('-');
      return `${m}/${y}`;
    }
    const [y, m, d] = key.split('-');
    if (mode === 'week') return `${d}/${m}`;
    return `${d}/${m}`;
  }, []);

  const chartData = useMemo(() => {
    const grouped = {};
    feedbacks.forEach(fb => {
      const raw = new Date(fb.created_at);
      let key;
      if (groupBy === 'month') {
        key = raw.toISOString().slice(0, 7);
      } else if (groupBy === 'week') {
        const tmp = new Date(raw);
        const day = tmp.getUTCDay();
        const diff = (day === 0 ? -6 : 1) - day;
        tmp.setUTCDate(tmp.getUTCDate() + diff);
        key = tmp.toISOString().slice(0, 10);
      } else {
        key = raw.toISOString().slice(0, 10);
      }
      if (!grouped[key]) grouped[key] = { key, likes: 0, dislikes: 0 };
      if (fb.rating === 'like') grouped[key].likes++;
      else grouped[key].dislikes++;
    });
    return Object.values(grouped)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(item => ({
        ...item,
        label: formatChartDate(item.key, groupBy),
        total: item.likes + item.dislikes,
      }));
  }, [feedbacks, groupBy, formatChartDate]);

  // All unique categories from stored config (union of like + dislike)
  const allCategories = useMemo(() => {
    const opts = getStoredOptions();
    const seen = new Set();
    const result = [];
    [...opts.like, ...opts.dislike].forEach(({ category }) => {
      if (!seen.has(category)) { seen.add(category); result.push(category); }
    });
    return result;
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side category filter applied on top of backend-fetched feedbacks
  const displayedFeedbacks = useMemo(() => {
    if (!categoryFilter) return feedbacks;
    const opts = getStoredOptions();
    const catTagSet = new Set(
      [...opts.like, ...opts.dislike]
        .filter(c => c.category === categoryFilter)
        .flatMap(c => c.tags)
    );
    if (catTagSet.size === 0) return feedbacks;
    return feedbacks.filter(fb => {
      const { tags } = parseFeedbackComment(fb.comment);
      return tags.some(t => catTagSet.has(t));
    });
  }, [feedbacks, categoryFilter]);  // eslint-disable-line react-hooks/exhaustive-deps

  const loadFeedbacks = useCallback(async () => {
    setIsLoading(true);
    try {
      const activeDateMode = dateMode === 'all' ? '' : dateMode;
      const data = await getAdminFeedbacks(
        ratingFilter, searchQuery, userFilter,
        activeDateMode, untilDate, fromDate, toDate
      );
      setFeedbacks(data.feedbacks || []);
      setStats(data.stats || { total: 0, likes: 0, dislikes: 0 });
      setUsers(dedupeByUserId(data.users || []));
    } catch (error) {
      console.error('Error loading feedbacks:', error);
    } finally {
      setIsLoading(false);
    }
  }, [ratingFilter, searchQuery, userFilter, dateMode, untilDate, fromDate, toDate]);

  const handleDateModeChange = (mode) => {
    setDateMode(mode);
    if (mode === 'all') {
      setUntilDate('');
      setFromDate('');
      setToDate('');
    }
  };

  const clearDateFilter = () => {
    setDateMode('all');
    setUntilDate('');
    setFromDate('');
    setToDate('');
  };

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

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3.5 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-[#0E3B8C]/10 rounded-lg">
                <BarChart3 className="w-5 h-5 text-[#0E3B8C]" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 leading-tight">{t('feedbackMgmt')}</h1>
                <p className="text-xs text-slate-400">{t('feedbackSubtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openConfigModal}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#0E3B8C]/10 hover:bg-[#0E3B8C]/20 text-[#0E3B8C] rounded-lg text-xs font-medium transition-colors"
              title="Configure feedback options"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure Options
            </button>
            <button
              onClick={loadFeedbacks}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
              title={t('refresh')}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              {t('refresh')}
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-5 space-y-5">

          {/* 1. Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: <MessageSquare className="w-5 h-5 text-blue-600" />, bg: 'bg-blue-50', value: stats.total,         label: t('totalFeedback') },
              { icon: <ThumbsUp    className="w-5 h-5 text-green-600" />, bg: 'bg-green-50', value: stats.likes,        label: t('likes') },
              { icon: <ThumbsDown  className="w-5 h-5 text-red-500"   />, bg: 'bg-red-50',   value: stats.dislikes,     label: t('dislikes') },
              { icon: <BarChart3   className="w-5 h-5 text-amber-600" />, bg: 'bg-amber-50', value: `${satisfactionRate}%`, label: t('satisfactionRate') },
            ].map((card, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3 shadow-sm">
                <div className={cn("p-2.5 rounded-xl flex-shrink-0", card.bg)}>{card.icon}</div>
                <div>
                  <p className="text-2xl font-bold text-slate-800 leading-tight">{card.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 2. Filter card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">{t('filterSection')}</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {/* Row 1: search + rating + category + user */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder={t('searchFeedback')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] focus:border-transparent bg-slate-50"
                  />
                </div>
                <div className="relative">
                  <select
                    value={ratingFilter}
                    onChange={(e) => setRatingFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer"
                  >
                    <option value="">{t('allFeedback')}</option>
                    <option value="like">{t('likesOnly')}</option>
                    <option value="dislike">{t('dislikesOnly')}</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {/* Category filter */}
                <div className="relative">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className={cn(
                      "appearance-none pl-3 pr-8 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer max-w-[220px]",
                      categoryFilter
                        ? "bg-[#0E3B8C]/5 border-[#0E3B8C]/30 text-[#0E3B8C] font-medium"
                        : "bg-slate-50 border-slate-200"
                    )}
                  >
                    <option value="">All Categories</option>
                    {allCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={userFilter}
                    onChange={(e) => setUserFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer max-w-[200px]"
                  >
                    <option value="">{t('allUsers')}</option>
                    {users.map(u => (
                      <option key={u.user_id} value={u.user_id}>{u.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Active category filter badge */}
              {categoryFilter && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#0E3B8C]/10 text-[#0E3B8C] border border-[#0E3B8C]/20 rounded-full text-xs font-medium">
                    <BarChart3 className="w-3 h-3" />
                    Category: {categoryFilter}
                    <button onClick={() => setCategoryFilter('')} className="ml-0.5 hover:opacity-60 transition-opacity">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                  <span className="text-xs text-slate-400">{displayedFeedbacks.length} result{displayedFeedbacks.length !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Row 2: date filter */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
                  {[
                    { key: 'all',   icon: null,                                  label: t('dateFilterAll') },
                    { key: 'until', icon: <Calendar      className="w-3.5 h-3.5" />, label: t('dateFilterUntil') },
                    { key: 'range', icon: <CalendarRange className="w-3.5 h-3.5" />, label: t('dateFilterRange') },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => handleDateModeChange(opt.key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                        dateMode === opt.key
                          ? opt.key === 'all' ? "bg-white text-slate-800 shadow-sm" : "bg-white text-[#0E3B8C] shadow-sm"
                          : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      {opt.icon}{opt.label}
                    </button>
                  ))}
                </div>

                {dateMode === 'until' && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">{t('dateUntil')}:</span>
                    <input
                      type="date" value={untilDate}
                      onChange={(e) => setUntilDate(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer"
                    />
                    {untilDate && (
                      <button onClick={clearDateFilter} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {dateMode === 'range' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-500 font-medium">{t('dateFrom')}:</span>
                    <input
                      type="date" value={fromDate} max={toDate || undefined}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer"
                    />
                    <span className="text-slate-300">—</span>
                    <span className="text-xs text-slate-500 font-medium">{t('dateTo')}:</span>
                    <input
                      type="date" value={toDate} min={fromDate || undefined}
                      onChange={(e) => setToDate(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#0E3B8C] cursor-pointer"
                    />
                    {(fromDate || toDate) && (
                      <button onClick={clearDateFilter} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {dateMode !== 'all' && (dateMode === 'until' ? untilDate : (fromDate || toDate)) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-medium">
                    <Calendar className="w-3 h-3" />
                    {dateMode === 'until'
                      ? `≤ ${new Date(untilDate + 'T00:00:00').toLocaleDateString(localeMap[lang] || 'vi-VN')}`
                      : [fromDate && new Date(fromDate + 'T00:00:00').toLocaleDateString(localeMap[lang] || 'vi-VN'), toDate && new Date(toDate + 'T00:00:00').toLocaleDateString(localeMap[lang] || 'vi-VN')].filter(Boolean).join(' → ')
                    }
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Chart card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-[#0E3B8C]" />
                <span className="text-sm font-semibold text-slate-700">{t('chartTitle')}</span>
                {feedbacks.length > 0 && (
                  <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {feedbacks.length} {t('entries')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  {[
                    { key: 'day',   label: t('groupByDay') },
                    { key: 'week',  label: t('groupByWeek') },
                    { key: 'month', label: t('groupByMonth') },
                  ].map(opt => (
                    <button key={opt.key} onClick={() => setGroupBy(opt.key)}
                      className={cn("px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                        groupBy === opt.key ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >{opt.label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
                  <button onClick={() => setChartType('bar')}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                      chartType === 'bar' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  ><BarChart2 className="w-3.5 h-3.5" />{t('chartBar')}</button>
                  <button onClick={() => setChartType('line')}
                    className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all",
                      chartType === 'line' ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"
                    )}
                  ><TrendingUp className="w-3.5 h-3.5" />{t('chartLine')}</button>
                </div>
              </div>
            </div>
            <div className="px-4 pt-5 pb-3">
              {chartData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-slate-400 gap-2">
                  <BarChart2 className="w-10 h-10 text-slate-200" />
                  <span className="text-sm">{t('chartNoData')}</span>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  {chartType === 'bar' ? (
                    <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} cursor={{ fill: '#f8fafc' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
                        formatter={(v) => v === 'likes' ? t('likes') : t('dislikes')} />
                      <Bar dataKey="likes"    name="likes"    fill="#22c55e" radius={[4,4,0,0]} maxBarSize={32} />
                      <Bar dataKey="dislikes" name="dislikes" fill="#ef4444" radius={[4,4,0,0]} maxBarSize={32} />
                    </BarChart>
                  ) : (
                    <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
                        formatter={(v) => v === 'likes' ? t('likes') : t('dislikes')} />
                      <Line type="monotone" dataKey="likes"    name="likes"    stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
                      <Line type="monotone" dataKey="dislikes" name="dislikes" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: '#ef4444' }} activeDot={{ r: 5 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 4. Feedback list card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">{t('feedbackListSection')}</span>
              </div>
              {!isLoading && displayedFeedbacks.length > 0 && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full font-medium">
                  {displayedFeedbacks.length}{feedbacks.length !== displayedFeedbacks.length ? ` / ${feedbacks.length}` : ''} {t('entries')}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              </div>
            ) : displayedFeedbacks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <MessageSquare className="w-14 h-14 text-slate-200" />
                <p className="text-base font-medium text-slate-500">
                  {categoryFilter ? `No feedback found for "${categoryFilter}"` : t('noFeedbackYet')}
                </p>
                <p className="text-sm text-slate-400">
                  {categoryFilter ? 'Try selecting a different category or clear the filter.' : t('noFeedbackDesc')}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {displayedFeedbacks.map((fb) => (
                  <div key={fb.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Row */}
                    {(() => {
                      const { tags: rowTags, extraComment: rowExtra } = parseFeedbackComment(fb.comment);
                      return (
                        <div
                          className="flex items-center gap-4 px-5 py-3.5 cursor-pointer"
                          onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
                        >
                          <div className={cn("p-2 rounded-lg flex-shrink-0", fb.rating === 'like' ? "bg-green-50" : "bg-red-50")}>
                            {fb.rating === 'like'
                              ? <ThumbsUp   className="w-4 h-4 text-green-600" />
                              : <ThumbsDown className="w-4 h-4 text-red-500" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-800 truncate">{fb.query || t('noQuestionData')}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <User className="w-3 h-3" />{fb.user_name}
                              </span>
                              <span className="text-xs text-slate-300">•</span>
                              <span className="text-xs text-slate-400">
                                {new Date(fb.created_at).toLocaleDateString(localeMap[lang] || 'vi-VN', {
                                  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                              {/* Inline tag chips */}
                              {rowTags.length > 0 && (
                                <>
                                  <span className="text-xs text-slate-300">•</span>
                                  <div className="flex flex-wrap gap-1">
                                    {rowTags.slice(0, 3).map((tag, ti) => (
                                      <span key={ti} className={cn(
                                        "px-2 py-0.5 rounded-full text-[10px] font-medium border",
                                        fb.rating === 'like'
                                          ? "bg-green-50 text-green-700 border-green-200"
                                          : "bg-red-50 text-red-600 border-red-200"
                                      )}>{tag}</span>
                                    ))}
                                    {rowTags.length > 3 && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 border border-slate-200">
                                        +{rowTags.length - 3}
                                      </span>
                                    )}
                                  </div>
                                </>
                              )}
                              {rowExtra && (
                                <>
                                  <span className="text-xs text-slate-300">•</span>
                                  <span className="text-xs text-blue-500 flex items-center gap-0.5">
                                    <MessageSquare className="w-3 h-3" />{t('comment')}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className={cn(
                            "px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0",
                            fb.rating === 'like' ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"
                          )}>
                            {fb.rating === 'like' ? t('like') : t('dislike')}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(fb.id); }}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                            title={t('delete')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronDown className={cn(
                            "w-4 h-4 text-slate-400 transition-transform flex-shrink-0",
                            expandedId === fb.id && "rotate-180"
                          )} />
                        </div>
                      );
                    })()}

                    {/* Expanded detail */}
                    {expandedId === fb.id && (() => {
                      const { tags, extraComment } = parseFeedbackComment(fb.comment);
                      return (
                        <div className="px-5 pb-5 pt-1 space-y-3 bg-slate-50/60 border-t border-slate-100">
                          {/* Question */}
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{t('question')}</p>
                            <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{fb.query || t('noQuestionData')}</p>
                            </div>
                          </div>

                          {/* AI Answer */}
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{t('aiAnswer')}</p>
                            <div className="bg-blue-50/60 rounded-lg border border-blue-100 px-4 py-3">
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{fb.answer || t('noQuestionData')}</p>
                            </div>
                          </div>

                          {/* Selected tags grouped by category */}
                          {tags.length > 0 && (() => {
                            const grouped = groupTagsByCategory(tags, fb.rating);
                            const isLike = fb.rating === 'like';
                            return (
                              <div>
                                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                                  {isLike ? '👍 Reasons for liking' : '👎 Reasons for disliking'}
                                </p>
                                <div className="space-y-2">
                                  {grouped.map(({ category, tags: catTags }, gi) => (
                                    <div key={gi} className={cn(
                                      "rounded-xl border px-4 py-3",
                                      isLike ? "bg-green-50/60 border-green-100" : "bg-red-50/60 border-red-100"
                                    )}>
                                      <p className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider mb-2",
                                        isLike ? "text-green-600" : "text-red-500"
                                      )}>{category}</p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {catTags.map((tag, ti) => (
                                          <span key={ti} className={cn(
                                            "px-3 py-1 rounded-full text-xs font-semibold border",
                                            isLike
                                              ? "bg-green-100 text-green-800 border-green-200"
                                              : "bg-red-100 text-red-700 border-red-200"
                                          )}>{tag}</span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Extra comment */}
                          {extraComment && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{t('comment')}</p>
                              <div className="bg-amber-50/60 rounded-lg border border-amber-100 px-4 py-3">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{extraComment}</p>
                              </div>
                            </div>
                          )}

                          {/* Old-style plain comment (no tags parsed) */}
                          {!tags.length && !extraComment && fb.comment && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">{t('comment')}</p>
                              <div className="bg-amber-50/60 rounded-lg border border-amber-100 px-4 py-3">
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{fb.comment}</p>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-xs text-slate-400 pt-1 border-t border-slate-100">
                            <span>{t('email')}: {fb.user_email || '—'}</span>
                            <span>Message ID: {fb.message_id?.slice(0, 16)}...</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Configure Feedback Options Modal ── */}
      {showConfigModal && configDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">

            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#0E3B8C]/10 rounded-lg">
                  <Settings className="w-4 h-4 text-[#0E3B8C]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Configure Feedback Options</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Customize the tags shown when users rate responses</p>
                </div>
              </div>
              <button onClick={() => setShowConfigModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="px-6 pt-4 flex-shrink-0">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                {[
                  { key: 'like',    icon: <ThumbsUp className="w-3.5 h-3.5" />,   label: 'Like (Positive)',  color: 'text-green-700' },
                  { key: 'dislike', icon: <ThumbsDown className="w-3.5 h-3.5" />, label: 'Dislike (Negative)', color: 'text-red-600' },
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setConfigTab(tab.key)}
                    className={cn(
                      "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      configTab === tab.key
                        ? `bg-white shadow-sm ${tab.color}`
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {tab.icon}{tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {configDraft[configTab].map((cat, catIdx) => (
                <div key={catIdx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  {/* Category name row */}
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    <input
                      type="text"
                      value={cat.category}
                      onChange={e => updateCategoryName(configTab, catIdx, e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-[#0E3B8C]/20 focus:border-[#0E3B8C]/40"
                      placeholder="Category name"
                    />
                    <button
                      onClick={() => removeCategory(configTab, catIdx)}
                      className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                      title="Remove category"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2 pl-6">
                    {cat.tags.map((tag, tagIdx) => (
                      <span
                        key={tagIdx}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border",
                          configTab === 'like'
                            ? "bg-green-50 border-green-200 text-green-800"
                            : "bg-red-50 border-red-200 text-red-800"
                        )}
                      >
                        {tag}
                        <button onClick={() => removeTag(configTab, catIdx, tagIdx)} className="hover:opacity-60 transition-opacity">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}

                    {/* Add tag inline */}
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={newTagInputs[`${configTab}-${catIdx}`] || ''}
                        onChange={e => setNewTagInputs(prev => ({ ...prev, [`${configTab}-${catIdx}`]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(configTab, catIdx); } }}
                        placeholder="Add tag..."
                        className="w-24 px-2.5 py-1 border border-dashed border-slate-300 rounded-full text-xs text-slate-600 placeholder:text-slate-400 focus:outline-none focus:border-[#0E3B8C]/40 bg-white"
                      />
                      <button
                        onClick={() => addTag(configTab, catIdx)}
                        className="p-1 text-slate-400 hover:text-[#0E3B8C] rounded-full hover:bg-[#0E3B8C]/10 transition-colors"
                        title="Add tag"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add category button */}
              <button
                onClick={() => addCategory(configTab)}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-400 hover:text-[#0E3B8C] hover:border-[#0E3B8C]/40 hover:bg-[#0E3B8C]/5 transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Category
              </button>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between flex-shrink-0">
              <button
                onClick={resetConfig}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to Default
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveConfig}
                  className="px-5 py-2 text-sm font-semibold bg-[#0E3B8C] hover:bg-[#0E3B8C]/90 text-white rounded-lg transition-colors shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackManagement;

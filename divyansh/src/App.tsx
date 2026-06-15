import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Plus,
  Trash2,
  Heart,
  Share2,
  LogOut,
  Moon,
  Sun,
  Tag,
  Sparkles,
  Upload,
  Download,
  Users,
  Phone,
  Mail,
  Briefcase,
  MapPin,
  FileText,
  LayoutDashboard,
  BarChart2,
  MoreVertical,
  Check,
  AlertTriangle,
  Loader2,
  Lock,
  UserPlus,
  X,
  MapPlus,
  Building2,
  ArrowUpDown,
  Filter,
  CheckSquare,
  Square,
  Sparkle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Contact, ContactCategory, DashboardStats, DuplicateSuggestion, SmartCategorizationResponse, User } from './types';
import { exportContactsToCSV, exportToPDF, parseCSVToJSON } from './utils/csv';

// ==========================================
// TOAST NOTIFICATIONS STATE & HELPERS
// ==========================================
interface Toast {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
}

export default function App() {
  // Theme and Tab persistence
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'contacts' | 'stats' | 'tools'>('dashboard');

  // Auth States
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('curr_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  
  // Auth Form Fields
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Core Data States
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  
  // Filtering & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ContactCategory | 'all'>('all');
  const [isOnlyFavorites, setIsOnlyFavorites] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'fullName' | 'createdAt'>('fullName');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // AI & Natural Search states
  const [naturalPhrase, setNaturalPhrase] = useState('');
  const [aiSearchFeedback, setAiSearchFeedback] = useState<string | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  // Smart categorization helper states on add/edit contact
  const [isAiCategorizing, setIsAiCategorizing] = useState(false);
  const [aiCategorizationResponse, setAiCategorizationResponse] = useState<SmartCategorizationResponse | null>(null);

  // Duplicates State
  const [duplicateSuggestions, setDuplicateSuggestions] = useState<DuplicateSuggestion[]>([]);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Toast array
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Detailed Modal Viewing States
  const [activeContactForDetail, setActiveContactForDetail] = useState<Contact | null>(null);
  const [activeContactForEdit, setActiveContactForEdit] = useState<Contact | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isConfirmDeleteContactId, setIsConfirmDeleteContactId] = useState<string | null>(null);
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [showQRForContact, setShowQRForContact] = useState<string | null>(null); // Contact ID

  // Skeletons / States loading
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Form Fields for Add/Edit
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formCategory, setFormCategory] = useState<ContactCategory>('Other');
  const [formNotes, setFormNotes] = useState('');
  const [formIsFavorite, setFormIsFavorite] = useState(false);
  const [formTags, setFormTags] = useState<string>(''); // comma split
  const [formProfilePhoto, setFormProfilePhoto] = useState<string>(''); // base64

  // Manual File Upload handler
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // COMPONENT INITIALIZATION & THEME TRIGGERS
  // ==========================================
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  useEffect(() => {
    if (token) {
      fetchContacts();
      fetchStats();
    }
  }, [token]);

  // Combined fetchers triggerred when data modifies
  const refreshAllData = () => {
    fetchContacts();
    fetchStats();
  };

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4500);
  };

  // ==========================================
  // CALLS TO SERVER BACKEND ENDPOINTS
  // ==========================================
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authEmail || !authPassword || (authMode === 'signup' && !authName)) {
      showToast('Please check all input forms value.', 'error');
      return;
    }

    setIsAuthLoading(true);
    try {
      const url = authMode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          fullName: authName,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Authenication failed.');

      localStorage.setItem('token', data.token);
      localStorage.setItem('curr_user', JSON.stringify(data.user));
      setToken(data.token);
      setCurrentUser(data.user);
      showToast(`Welcome back, ${data.user.fullName}!`, 'success');
      
      // Clear forms
      setAuthEmail('');
      setAuthPassword('');
      setAuthName('');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('curr_user');
    setToken(null);
    setCurrentUser(null);
    setContacts([]);
    setStats(null);
    showToast('Successfully logged out.', 'info');
  };

  const fetchContacts = async (nlFilterParams?: any) => {
    if (!token) return;
    setIsLoadingContacts(true);
    try {
      let queryParams = new URLSearchParams();
      if (nlFilterParams) {
        if (nlFilterParams.query) queryParams.append('query', nlFilterParams.query);
        if (nlFilterParams.category) queryParams.append('category', nlFilterParams.category);
        if (nlFilterParams.isFavorite !== undefined) queryParams.append('isFavorite', String(nlFilterParams.isFavorite));
        if (nlFilterParams.companyName) queryParams.append('query', nlFilterParams.companyName); // route through general query on server
        if (nlFilterParams.tags && nlFilterParams.tags.length > 0) queryParams.append('tag', nlFilterParams.tags[0]);
      } else {
        // use standard frontend state filters
        if (searchQuery) queryParams.append('query', searchQuery);
        if (selectedCategory && selectedCategory !== 'all') queryParams.append('category', selectedCategory);
        if (isOnlyFavorites) queryParams.append('isFavorite', 'true');
        if (selectedTag) queryParams.append('tag', selectedTag);
        queryParams.append('sortBy', sortBy);
        queryParams.append('sortOrder', sortOrder);
      }

      const res = await fetch(`/api/contacts?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch contacts list');
      setContacts(data);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const fetchStats = async () => {
    if (!token) return;
    try {
      const res = await fetch('/api/contacts/stats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Stats aggregation fetch outline error', err);
    }
  };

  // Create or Update Contact Trigger
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formPhone || !formEmail) {
      showToast('Name, Phone Number, and Email details are required.', 'error');
      return;
    }

    setIsSubmittingForm(true);
    try {
      const contactPayload = {
        fullName: formName,
        mobileNumber: formPhone,
        emailAddress: formEmail,
        companyName: formCompany,
        address: formAddress,
        notes: formNotes,
        category: formCategory,
        isFavorite: formIsFavorite,
        tags: formTags.split(',').map(t => t.trim()).filter(Boolean),
        profilePhoto: formProfilePhoto
      };

      const isEditing = !!activeContactForEdit;
      const url = isEditing ? `/api/contacts/${activeContactForEdit.id}` : '/api/contacts';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(contactPayload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to store contact detail');

      showToast(`Contact "${data.fullName}" is successfully ${isEditing ? 'updated' : 'created'}!`, 'success');
      
      // Close forms and refresh
      setIsAddModalOpen(false);
      setActiveContactForEdit(null);
      resetFormFields();
      refreshAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleDeleteContact = async (id: string) => {
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete process failure.');
      
      showToast('Contact successfully removed.', 'success');
      setIsConfirmDeleteContactId(null);
      
      // Close detail view if deleting current
      if (activeContactForDetail?.id === id) {
        setActiveContactForDetail(null);
      }

      refreshAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    try {
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ids: selectedContactIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bulk deletion failed.');

      showToast(`Successfully removed ${data.count} contacts.`, 'success');
      setSelectedContactIds([]);
      setIsBulkDeleteConfirmOpen(false);
      refreshAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // ==========================================
  // AI INTEGRATION CLIENT ACTIONS (GEMINI CORE)
  // ==========================================

  // 1. Natural Language search trigger
  const handleNaturalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!naturalPhrase.trim()) return;

    setIsAiSearching(true);
    setAiSearchFeedback(null);
    try {
      const res = await fetch('/api/ai/natural-search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ phrase: naturalPhrase })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse speech with AI.');

      setAiSearchFeedback(data.explanation);
      showToast('AI Filter parsed successfully!', 'success');

      // Update filters using parsed response
      if (data.hasFilters) {
        fetchContacts(data.searchFilter);
      } else {
        fetchContacts(); // fall back to normal
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsAiSearching(false);
    }
  };

  // 2. Smart Category Advisor trigger
  const runSmartCategorization = async () => {
    if (!formName && !formCompany && !formNotes) {
      showToast('Provide at least Name, Company, or Notes before running smart advisor.', 'info');
      return;
    }

    setIsAiCategorizing(true);
    setAiCategorizationResponse(null);
    try {
      const res = await fetch('/api/ai/categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: formName,
          companyName: formCompany,
          emailAddress: formEmail,
          notes: formNotes,
          tags: formTags.split(',').map(t => t.trim()).filter(Boolean)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto categorize failed.');

      setAiCategorizationResponse(data);
      setFormCategory(data.suggestedCategory);
      showToast(`AI Suggested: ${data.suggestedCategory} category!`, 'success');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsAiCategorizing(false);
    }
  };

  // 3. AI duplicate scan trigger
  const runDuplicateScan = async () => {
    setIsCheckingDuplicates(true);
    setDuplicateSuggestions([]);
    try {
      const res = await fetch('/api/ai/duplicate-check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deduplication failed.');

      setDuplicateSuggestions(data);
      if (data.length === 0) {
        showToast('Excellent! No duplicate contacts were detected.', 'success');
      } else {
        showToast(`Detected ${data.length} potential duplicate pairings.`, 'info');
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // ==========================================
  // LOCAL FORM & UTILITIES HANDLING
  // ==========================================
  const resetFormFields = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormCompany('');
    setFormAddress('');
    setFormNotes('');
    setFormCategory('Other');
    setFormIsFavorite(false);
    setFormTags('');
    setFormProfilePhoto('');
    setAiCategorizationResponse(null);
  };

  const openAddModal = () => {
    setActiveContactForEdit(null);
    resetFormFields();
    setIsAddModalOpen(true);
  };

  const openEditModal = (contact: Contact) => {
    setActiveContactForEdit(contact);
    setFormName(contact.fullName);
    setFormPhone(contact.mobileNumber);
    setFormEmail(contact.emailAddress);
    setFormCompany(contact.companyName || '');
    setFormAddress(contact.address || '');
    setFormNotes(contact.notes || '');
    setFormCategory(contact.category);
    setFormIsFavorite(contact.isFavorite);
    setFormTags(contact.tags.join(', '));
    setFormProfilePhoto(contact.profilePhoto || '');
    setAiCategorizationResponse(null);
    setIsAddModalOpen(true);
  };

  // Base64 file image reader
  const handleProfilePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showToast('Photo must be less than 2MB in size.', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFormProfilePhoto(reader.result);
        showToast('Image uploaded and optimized locally.', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Drag & Drop photo uploads
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 2 * 1024 * 1024) {
        showToast('Photo must be less than 2MB.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setFormProfilePhoto(reader.result);
          showToast('Image dropped and attached!', 'success');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Bulk Import CSV handler
  const triggerCSVImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const text = reader.result as string;
        const list = parseCSVToJSON(text);

        if (list.length === 0) {
          showToast('No valid contact entries found in CSV.', 'error');
          return;
        }

        const res = await fetch('/api/contacts/import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ dataList: list })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'CSV import server process failed.');

        showToast(`Successfully imported ${data.count} contacts from CSV!`, 'success');
        refreshAllData();
      } catch (err: any) {
        showToast(err.message, 'error');
      }
    };
    reader.readAsText(file);
    // Reset file input back
    if (e.target) e.target.value = '';
  };

  // Favorite toggle fast inline route direct
  const toggleFavoriteInline = async (contact: Contact) => {
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isFavorite: !contact.isFavorite })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // update state
      setContacts(prev => prev.map(c => c.id === contact.id ? data : c));
      showToast(`${contact.fullName} ${!contact.isFavorite ? 'marked' : 'unmarked'} as favorite!`, 'success');
      fetchStats();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const handleSelectContactCheckbox = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedContactIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllContacts = () => {
    if (selectedContactIds.length === contacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(contacts.map(c => c.id));
    }
  };

  // Safe client side merge duplicate trigger
  const resolveDuplicateMerge = async (pair: DuplicateSuggestion, keepId: 'A' | 'B') => {
    const keepContact = keepId === 'A' ? pair.contactA : pair.contactB;
    const dropContact = keepId === 'A' ? pair.contactB : pair.contactA;

    try {
      // 1. Delete redundant entry
      const deleteRes = await fetch(`/api/contacts/${dropContact.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!deleteRes.ok) throw new Error('Failed to discard duplicate contact.');

      // 2. Supplement merged details on kept contact (e.g., merge notes / company etc if missing)
      const mergedUpdates: Partial<Contact> = {};
      if (!keepContact.companyName && dropContact.companyName) {
        mergedUpdates.companyName = dropContact.companyName;
      }
      if (!keepContact.address && dropContact.address) {
        mergedUpdates.address = dropContact.address;
      }
      if (dropContact.notes) {
        mergedUpdates.notes = `${keepContact.notes || ''}\n[Merged info]: ${dropContact.notes}`.trim();
      }
      const combinedTags = Array.from(new Set([...keepContact.tags, ...dropContact.tags]));
      mergedUpdates.tags = combinedTags;

      const mergeRes = await fetch(`/api/contacts/${keepContact.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(mergedUpdates)
      });

      if (!mergeRes.ok) throw new Error('Failed to compile merging details onto prioritized contact.');

      showToast(`Merged successfully! Kept ${keepContact.fullName}.`, 'success');
      
      // Update check panel lists
      setDuplicateSuggestions(prev => prev.filter(p => !(p.contactA.id === pair.contactA.id && p.contactB.id === pair.contactB.id)));
      refreshAllData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Helper colors mapping for Category Pills
  const getCategoryColorStyles = (cat: ContactCategory) => {
    switch (cat) {
      case 'Family': return 'border border-black/10 text-slate-800 bg-[#FAF1F3] dark:border-white/10 dark:text-slate-200 dark:bg-[#1E1215]';
      case 'Friends': return 'border border-black/10 text-slate-800 bg-[#EFF5F1] dark:border-white/10 dark:text-slate-200 dark:bg-[#111A14]';
      case 'Work': return 'border border-black/20 text-white bg-black dark:border-white/20 dark:text-black dark:bg-white';
      case 'Business': return 'border border-black/10 text-slate-800 bg-[#FAF6EE] dark:border-white/10 dark:text-slate-200 dark:bg-[#1A1813]';
      default: return 'border border-slate-200 text-slate-800 dark:border-slate-800 dark:text-slate-200';
    }
  };

  // Placeholder generators for avatars
  const getInitials = (name: string) => {
    return name ? name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'C';
  };

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isDark ? 'dark bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* ==========================================
          HEADER BAR / APP CONTAINER
         ========================================== */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-950/70 backdrop-blur-md shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo Brand Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="bg-brand-500 text-white p-2.5 rounded-xl shadow-md shadow-brand-500/20 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg tracking-tight bg-gradient-to-r from-brand-600 to-indigo-500 dark:from-brand-500 dark:to-indigo-400 bg-clip-text text-transparent">
                Connectize
              </h1>
              <p className="text-[10px] text-slate-500 font-mono -mt-1 uppercase tracking-wider">AI Contact Engine</p>
            </div>
          </div>

          {/* Core Controls */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            
            {/* Theme Toggle Button */}
            <button
              onClick={() => setIsDark(!isDark)}
              id="theme-toggler"
              className="p-2 rounded-xl text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              aria-label="Toggle Theme"
            >
              {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-600" />}
            </button>

            {/* Log out option if logged in */}
            {token && currentUser && (
              <div className="flex items-center space-x-3 border-l border-slate-200 dark:border-slate-800 pl-3 sm:pl-4">
                <span className="hidden md:inline text-xs font-medium max-w-[120px] truncate">
                  {currentUser.fullName}
                </span>
                <button
                  onClick={handleLogout}
                  id="logout-btn"
                  className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-colors md:flex items-center space-x-1"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="hidden sm:inline text-xs font-medium">Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ==========================================
          AUTHENTICATION BOARD ROUTE (NOT LOGGED IN)
         ========================================== */}
      <AnimatePresence mode="wait">
        {!token ? (
          <motion.main
            key="auth-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex-grow flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950"
          >
            <div className="w-full max-w-md glass-panel p-8 rounded-2xl shadow-xl border border-white/20">
              
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-gradient-to-tr from-brand-600 to-indigo-500 text-white rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-brand-500/10 mb-4 animate-pulse">
                  <Users className="w-7 h-7" />
                </div>
                <h2 className="font-display font-semibold text-2xl tracking-tight">
                  {authMode === 'login' ? 'Welcome Back' : 'Get Started Now'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  Professional intelligent directory and CRM analytics dashboard.
                </p>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 font-mono uppercase tracking-wider">Full Name</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                        <Users className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        value={authName}
                        onChange={e => setAuthName(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-500 transition-colors"
                        placeholder="Elizabeth Bennett"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 font-mono uppercase tracking-wider">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      type="email"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-500 transition-colors"
                      placeholder="liz@domain.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 font-mono uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={e => setAuthPassword(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500 dark:focus:border-brand-500 transition-colors"
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full mt-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl py-3 font-semibold text-sm shadow-md shadow-brand-500/10 cursor-pointer active:scale-[0.98] transition-all flex items-center justify-center space-x-2"
                >
                  {isAuthLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : authMode === 'login' ? (
                    <>
                      <span>Sign In</span>
                      <Lock className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Create Account</span>
                      <UserPlus className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Form Toggler link */}
              <div className="text-center mt-6 pt-5 border-t border-slate-200/60 dark:border-slate-800/60">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {authMode === 'login' ? "Don't have an account of your own?" : "Already have an account?"}
                  <button
                    onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                    className="ml-1.5 text-brand-500 hover:underline font-semibold font-mono"
                  >
                    {authMode === 'login' ? 'SignUp Here' : 'LogIn Here'}
                  </button>
                </p>
              </div>

            </div>
          </motion.main>
        ) : (
          
          // ==========================================
          // CORE LOGGED IN APPLICATION VIEWPORT
          // ==========================================
          <motion.div
            key="app-viewport"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-grow flex flex-col md:flex-row max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 gap-8"
          >
            
            {/* Sidebar Navigation */}
            <aside className="w-full md:w-64 shrink-0">
              <nav className="glass-panel p-4 rounded-2xl flex flex-row md:flex-col justify-around md:justify-start gap-1 sm:gap-2 border border-slate-200/50 dark:border-slate-800/50">
                
                <button
                  onClick={() => setActiveTab('dashboard')}
                  className={`w-full flex items-center justify-center md:justify-start space-x-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wider font-mono uppercase transition-all ${
                    activeTab === 'dashboard'
                      ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-4.5 h-4.5" />
                  <span className="hidden md:inline">Dashboard</span>
                </button>

                <button
                  onClick={() => { setActiveTab('contacts'); fetchContacts(); }}
                  className={`w-full flex items-center justify-center md:justify-start space-x-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wider font-mono uppercase transition-all ${
                    activeTab === 'contacts'
                      ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <Users className="w-4.5 h-4.5" />
                  <span className="hidden md:inline">Contacts</span>
                </button>

                <button
                  onClick={() => setActiveTab('stats')}
                  className={`w-full flex items-center justify-center md:justify-start space-x-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wider font-mono uppercase transition-all ${
                    activeTab === 'stats'
                      ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <BarChart2 className="w-4.5 h-4.5" />
                  <span className="hidden md:inline">Analytics</span>
                </button>

                <button
                  onClick={() => { setActiveTab('tools'); runDuplicateScan(); }}
                  className={`w-full flex items-center justify-center md:justify-start space-x-3 px-4 py-3 rounded-xl text-xs font-semibold tracking-wider font-mono uppercase transition-all ${
                    activeTab === 'tools'
                      ? 'bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-md shadow-brand-500/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900'
                  }`}
                >
                  <Sparkles className="w-4.5 h-4.5 animate-pulse" />
                  <span className="hidden md:inline">AI Tools</span>
                </button>

              </nav>

              {/* Micro Quick stats on side panel on desktop */}
              {stats && (
                <div className="hidden md:block mt-6 glass-panel p-5 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
                  <h3 className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-3">CRM Distribution</h3>
                  <div className="space-y-2.5">
                    {Object.entries(stats.categoryDistribution).map(([cat, count]) => {
                      const total = stats.totalContacts || 1;
                      const percentage = Math.round(((count as number) / total) * 100);
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-semibold text-slate-600 dark:text-slate-400">{cat}</span>
                            <span className="font-mono text-slate-500">{count} ({percentage}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-brand-500 h-full rounded-full"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </aside>

            {/* Core Action Workspace View */}
            <main className="flex-grow overflow-hidden">

              <AnimatePresence mode="wait">
                
                {/* 1. DASHBOARD VIEW */}
                {activeTab === 'dashboard' && (
                  <motion.div
                    key="tab-dashboard"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6"
                  >
                    
                    {/* Welcome Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h2 className="font-display font-bold text-2.5xl tracking-tight">
                          Hello, {currentUser?.fullName}!
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                          Here's an overview of your intelligent directory diagnostics & recent sync history.
                        </p>
                      </div>
                      <button
                        onClick={openAddModal}
                        id="new-contact-dash"
                        className="bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider font-mono flex items-center space-x-2 shadow-md shadow-brand-500/10 cursor-pointer active:scale-95 transition-transform"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Add contact</span>
                      </button>
                    </div>

                    {/* Stats counters grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      
                      <div className="glass-panel p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 bottom-0 pr-6 pb-6 text-slate-100 dark:text-slate-900 group-hover:scale-110 transition-transform duration-500">
                          <Users className="w-20 h-20 opacity-10" />
                        </div>
                        <div>
                          <p className="text-[10px] font-mono tracking-wider text-slate-500 dark:text-slate-400 uppercase">Total contacts in scope</p>
                          <h4 className="text-4xl font-display font-semibold mt-2.5">{stats ? stats.totalContacts : '-'}</h4>
                        </div>
                      </div>

                      <div className="glass-panel p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 bottom-0 pr-6 pb-6 text-slate-100 dark:text-slate-900 group-hover:scale-110 transition-transform duration-500">
                          <Heart className="w-20 h-20 opacity-10" />
                        </div>
                        <div>
                          <p className="text-[10px] font-mono tracking-wider text-slate-500 dark:text-slate-400 uppercase">Favorites identified</p>
                          <h4 className="text-4xl font-display font-semibold mt-2.5 text-amber-500">{stats ? stats.favoriteContacts : '-'}</h4>
                        </div>
                      </div>

                      <div className="glass-panel p-6 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 sm:col-span-2 lg:col-span-1 flex items-center justify-between shadow-sm relative overflow-hidden group">
                        <div className="absolute right-0 bottom-0 pr-6 pb-6 text-slate-100 dark:text-slate-900 group-hover:scale-110 transition-transform duration-500">
                          <Sparkles className="w-20 h-20 opacity-10" />
                        </div>
                        <div>
                          <p className="text-[10px] font-mono tracking-wider text-slate-500 dark:text-slate-400 uppercase">Duplicate indicators</p>
                          <h4 className="text-4xl font-display font-semibold mt-2.5 text-indigo-500">
                            {duplicateSuggestions.length > 0 ? duplicateSuggestions.length : 'Healthy'}
                          </h4>
                        </div>
                      </div>

                    </div>

                    {/* Dashboard Split: Recent Contacts & Dynamic Category distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Recently Added Section */}
                      <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-col h-[400px]">
                        <div className="flex justify-between items-center pb-4 border-b border-slate-100 dark:border-slate-800/60 mb-4 shrink-0">
                          <h3 className="font-display font-bold text-base tracking-tight flex items-center space-x-2">
                            <span className="w-2 h-2 rounded-full bg-brand-500 animate-ping" />
                            <span>Recently Added Directory</span>
                          </h3>
                          <button
                            onClick={() => setActiveTab('contacts')}
                            className="text-xs text-brand-500 font-semibold font-mono hover:underline"
                          >
                            View all
                          </button>
                        </div>

                        <div className="flex-grow overflow-y-auto space-y-3 pr-1">
                          {stats && stats.recentContacts.length > 0 ? (
                            stats.recentContacts.map(c => (
                              <div
                                key={c.id}
                                onClick={() => setActiveContactForDetail(c)}
                                className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800/60 bg-white/40 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900 cursor-pointer transition-all"
                              >
                                <div className="flex items-center space-x-3">
                                  {c.profilePhoto ? (
                                    <img src={c.profilePhoto} alt={c.fullName} referrerPolicy="no-referrer" className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-slate-800" />
                                  ) : (
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-xs bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 font-mono">
                                      {getInitials(c.fullName)}
                                    </div>
                                  )}
                                  <div>
                                    <h4 className="font-semibold text-xs tracking-tight">{c.fullName}</h4>
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">{c.mobileNumber}</p>
                                  </div>
                                </div>
                                <span className={`text-[10px] px-2.5 py-1 rounded-full border font-mono ${getCategoryColorStyles(c.category)}`}>
                                  {c.category}
                                </span>
                              </div>
                            ))
                          ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                              <Users className="w-8 h-8 opacity-20 mb-2" />
                              <p className="text-xs">No contacts imported or created yet.</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* SVG Visual category count charts */}
                      <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-col h-[400px]">
                        <div className="pb-4 border-b border-slate-100 dark:border-slate-800/60 mb-4 shrink-0">
                          <h3 className="font-display font-medium text-base tracking-tight">Categorization Metrics</h3>
                        </div>

                        <div className="flex-grow flex flex-col justify-center">
                          {stats && stats.totalContacts > 0 ? (
                            <div className="space-y-4">
                              
                              {/* Custom crisp SVG donut representation for Category counts graph */}
                              <div className="flex justify-center items-center gap-6">
                                <svg width="150" height="150" viewBox="0 0 100 100" className="-rotate-90">
                                  {/* Render standard rings */}
                                  <circle cx="50" cy="50" r="40" fill="transparent" stroke="#e2e8f0" strokeWidth="8" />
                                  {(() => {
                                    let accumulatedPercent = 0;
                                    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#6366f1'];
                                    return Object.entries(stats.categoryDistribution).map(([cat, count], idx) => {
                                      const total = stats.totalContacts || 1;
                                      const percent = ((count as number) / total) * 100;
                                      const dashArray = `${percent} ${100 - percent}`;
                                      const dashOffset = 100 - accumulatedPercent + 25; // adjust rotation offset
                                      accumulatedPercent += percent;
                                      
                                      if (count === 0) return null;
                                      
                                      return (
                                        <circle
                                          key={cat}
                                          cx="50"
                                          cy="50"
                                          r="40"
                                          fill="transparent"
                                          stroke={colors[idx % colors.length]}
                                          strokeWidth="8"
                                          strokeDasharray="251.2" // approx 2pi r
                                          // percentage values mapping
                                          strokeDashoffset={251.2 - (251.2 * percent / 100) + (251.2 * (accumulatedPercent - percent) / 100)}
                                        />
                                      );
                                    });
                                  })()}
                                </svg>

                                <div className="space-y-2 text-xs">
                                  {(() => {
                                    const dotColor = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-pink-500', 'bg-indigo-500'];
                                    return Object.entries(stats.categoryDistribution).map(([cat, count], idx) => (
                                      <div key={cat} className="flex items-center space-x-2">
                                        <div className={`w-2.5 h-2.5 rounded-full ${dotColor[idx % dotColor.length]}`} />
                                        <span className="font-semibold text-slate-600 dark:text-slate-400">{cat}:</span>
                                        <span className="font-mono text-slate-500 font-bold">{count}</span>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              </div>

                              <div className="text-center">
                                <p className="text-[10px] text-slate-500 font-mono">Doughnut representation proportional to active contact directories</p>
                              </div>

                            </div>
                          ) : (
                            <div className="text-center py-10 text-slate-500">
                              <Users className="w-8 h-8 opacity-20 mb-2 mx-auto" />
                              <p className="text-xs">Aggregate charts will appear once you add contacts.</p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                  </motion.div>
                )}

                {/* 2. CONTACTS DIRECTORY LIST VIEW */}
                {activeTab === 'contacts' && (
                  <motion.div
                    key="tab-contacts"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-5"
                  >
                    
                    {/* Natural search AI Assistant Panel */}
                    <div className="glass-panel p-4 rounded-2xl border border-indigo-200/50 dark:border-indigo-900/30 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm">
                      <form onSubmit={handleNaturalSearch} className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-grow">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-indigo-500">
                            <Sparkles className="w-4.5 h-4.5" />
                          </span>
                          <input
                            type="text"
                            value={naturalPhrase}
                            onChange={e => setNaturalPhrase(e.target.value)}
                            className="w-full bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 rounded-xl py-2.5 pl-10 pr-4 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-shadow"
                            placeholder='Describe filter, e.g., "Show my work contacts from IBM" or "Find favorites in family category"'
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={isAiSearching}
                          className="bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider font-mono flex items-center justify-center space-x-2 shrink-0 cursor-pointer disabled:opacity-75"
                        >
                          {isAiSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          <span>AI filter</span>
                        </button>
                      </form>
                      
                      {aiSearchFeedback && (
                        <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 bg-indigo-100/30 dark:bg-indigo-950/30 p-2.5 rounded-xl flex items-center justify-between font-mono">
                          <span className="flex items-center space-x-1.5">
                            <Sparkle className="w-3.5 h-3.5" />
                            <span>{aiSearchFeedback}</span>
                          </span>
                          <button
                            onClick={() => { setAiSearchFeedback(null); setNaturalPhrase(''); fetchContacts(); }}
                            className="text-indigo-400 hover:text-indigo-700 ml-2"
                            title="Reset AI filter"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Filters Toolbar */}
                    <div className="glass-panel p-4 rounded-xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm space-y-3">
                      
                      <div className="flex flex-col sm:flex-row gap-3 justify-between">
                        
                        {/* Literal Keyword Search */}
                        <div className="relative flex-grow max-w-sm">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <Search className="w-4 h-4" />
                          </span>
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={e => { setSearchQuery(e.target.value); setTimeout(fetchContacts, 100); }}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-brand-500"
                            placeholder="Search name, phone, email, notes..."
                          />
                        </div>

                        {/* Dropdowns */}
                        <div className="flex items-center gap-2 overflow-x-auto">
                          
                          {/* Sorter Selector */}
                          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2">
                            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                            <select
                              value={sortBy}
                              onChange={e => { setSortBy(e.target.value as any); setTimeout(fetchContacts, 100); }}
                              className="bg-transparent text-xs py-1.5 focus:outline-none border-none font-mono cursor-pointer"
                            >
                              <option value="fullName">Name (A-Z)</option>
                              <option value="createdAt">Date Created</option>
                            </select>
                          </div>

                          {/* Sorter Direction Toggler */}
                          <button
                            onClick={() => { setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc'); setTimeout(fetchContacts, 100); }}
                            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-950 font-mono text-xs transition-colors"
                            title="Toggle order"
                          >
                            {sortOrder.toUpperCase()}
                          </button>

                          {/* Category Filter Pills */}
                          <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2">
                            <Filter className="w-3.5 h-3.5 text-slate-400 mr-1 shrink-0" />
                            <select
                              value={selectedCategory}
                              onChange={e => { setSelectedCategory(e.target.value as any); setTimeout(fetchContacts, 100); }}
                              className="bg-transparent text-xs py-1.5 focus:outline-none border-none font-mono cursor-pointer"
                            >
                              <option value="all">All Groups</option>
                              <option value="Family">Family</option>
                              <option value="Friends">Friends</option>
                              <option value="Work">Work</option>
                              <option value="Business">Business</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          {/* Only Favorites toggler */}
                          <button
                            onClick={() => { setIsOnlyFavorites(!isOnlyFavorites); setTimeout(fetchContacts, 100); }}
                            className={`p-2 rounded-xl border flex items-center space-x-1.5 cursor-pointer text-xs font-mono transition-all ${
                              isOnlyFavorites
                                ? 'bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-950/30'
                                : 'border-slate-200 dark:border-slate-800 text-slate-500'
                            }`}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isOnlyFavorites ? 'fill-amber-500 text-amber-500' : ''}`} />
                            <span>Favs</span>
                          </button>

                        </div>

                      </div>

                    </div>

                    {/* Bulk Action Controls bar if checkboxes clicked */}
                    {selectedContactIds.length > 0 && (
                      <div className="p-3 bg-brand-50 border border-brand-200 dark:bg-slate-900 dark:border-slate-800 rounded-xl flex items-center justify-between text-xs animate-slideDown shadow-sm">
                        <div className="flex items-center space-x-2 font-mono">
                          <CheckSquare className="w-4 h-4 text-brand-500 cursor-pointer" onClick={() => setSelectedContactIds([])} />
                          <span>Selected <strong>{selectedContactIds.length}</strong> contacts</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              const list = contacts.filter(c => selectedContactIds.includes(c.id));
                              exportContactsToCSV(list);
                            }}
                            className="px-3 py-1.5 text-slate-700 bg-white dark:bg-slate-800 dark:text-slate-200 font-semibold font-mono rounded-lg hover:bg-slate-100 flex items-center space-x-1 text-[11px] uppercase border"
                          >
                            <Download className="w-3 h-3" />
                            <span>Export CSV</span>
                          </button>
                          <button
                            onClick={() => setIsBulkDeleteConfirmOpen(true)}
                            className="px-3 py-1.5 text-rose-600 bg-rose-50 border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900 rounded-lg hover:bg-rose-100 flex items-center space-x-1 text-[11px] uppercase font-mono"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete bulk</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Grid List View of Contacts */}
                    {isLoadingContacts ? (
                      // Skeleton Loading blocks
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1, 2, 3, 4, 5, 6].map((idx) => (
                          <div key={idx} className="glass-panel p-5 rounded-2xl border border-slate-200/50 animate-pulse space-y-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-12 h-12 bg-slate-200 dark:bg-slate-800 rounded-full" />
                              <div className="space-y-2 flex-grow">
                                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                                <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                              </div>
                            </div>
                            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-5/6" />
                            <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-3/4" />
                          </div>
                        ))}
                      </div>
                    ) : contacts.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        
                        {contacts.map((c) => {
                          const isChecked = selectedContactIds.includes(c.id);
                          return (
                            <div
                              key={c.id}
                              onClick={() => setActiveContactForDetail(c)}
                              className={`glass-card p-5 rounded-2xl border ${
                                isChecked
                                  ? 'border-brand-500 shadow-brand-500/5 ring-1 ring-brand-400'
                                  : 'border-slate-200/50 dark:border-slate-800/50'
                              } hover:scale-[1.01] hover:shadow-md transition-all relative flex flex-col justify-between group cursor-pointer`}
                            >
                              
                              {/* Overlay Checkbox Selection */}
                              <div
                                onClick={(e) => handleSelectContactCheckbox(c.id, e)}
                                className="absolute top-4 left-4 z-10 w-5 h-5 rounded-lg flex items-center justify-center border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer"
                              >
                                {isChecked && <Check className="w-4.5 h-4.5 text-brand-500" />}
                              </div>

                              {/* Favorite Trigger Action */}
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleFavoriteInline(c); }}
                                className="absolute top-4 right-4 z-10 p-1.5 bg-white/80 dark:bg-slate-900/80 rounded-full shadow-sm hover:scale-105 active:scale-95 transition-transform"
                                title="Add/Remove favorite"
                              >
                                <Heart className={`w-4 h-4 ${c.isFavorite ? 'fill-amber-500 text-amber-500' : 'text-slate-400 hover:text-slate-600'}`} />
                              </button>

                              {/* Profile and general header */}
                              <div className="flex items-center space-x-3 mb-4 mt-2">
                                {c.profilePhoto ? (
                                  <img src={c.profilePhoto} alt={c.fullName} referrerPolicy="no-referrer" className="w-12 h-12 rounded-full object-cover border border-slate-200 dark:border-slate-800 shrink-0" />
                                ) : (
                                  <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm bg-gradient-to-tr from-brand-50 to-brand-100 text-brand-700 dark:from-brand-950/40 dark:to-indigo-950/40 dark:text-brand-300 font-mono shrink-0">
                                    {getInitials(c.fullName)}
                                  </div>
                                )}
                                <div className="min-w-0 flex-grow">
                                  <h4 className="font-semibold text-sm truncate pr-6">{c.fullName}</h4>
                                  
                                  {c.companyName && (
                                    <p className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center space-x-1 truncate">
                                      <Building2 className="w-3 h-3 shrink-0" />
                                      <span>{c.companyName}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Specific Contact values details */}
                              <div className="space-y-2 text-xs mb-4">
                                <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-450 font-mono">
                                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{c.mobileNumber}</span>
                                </div>
                                <div className="flex items-center space-x-2 text-slate-600 dark:text-slate-450 font-mono">
                                  <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span className="truncate">{c.emailAddress}</span>
                                </div>
                              </div>

                              {/* Footer category and tags pills */}
                              <div className="flex items-center justify-between border-t border-slate-100/60 dark:border-slate-800/60 pt-3 mt-auto flex-wrap gap-2">
                                <span className={`text-[10px] uppercase tracking-wider font-mono px-2.5 py-1 rounded-full border ${getCategoryColorStyles(c.category)}`}>
                                  {c.category}
                                </span>
                                
                                <div className="flex items-center space-x-1">
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openEditModal(c); }}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                                    title="Edit settings"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setIsConfirmDeleteContactId(c.id); }}
                                    className="p-1 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                                    title="Delete contact"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                            </div>
                          );
                        })}

                      </div>
                    ) : (
                      <div className="glass-panel p-10 rounded-2xl border text-center text-slate-500">
                        <Users className="w-12 h-12 opacity-20 mx-auto mb-3" />
                        <h4 className="font-semibold text-slate-600 dark:text-slate-400">No matching contacts</h4>
                        <p className="text-xs mt-1 max-w-sm mx-auto">Either clear filters, refine query search, or run import from CRM source data.</p>
                      </div>
                    )}

                  </motion.div>
                )}

                {/* 3. DIAGNOSTICS & ANALYTICS CHARTS TAB */}
                {activeTab === 'stats' && (
                  <motion.div
                    key="tab-stats"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6"
                  >
                    
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                      <h2 className="font-display font-medium text-2xl">Aggregate Analytics Dashboard</h2>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Durable insights and tag distribution trends representing sync operations.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* Growth Trend Chart (SVG) */}
                      <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-col h-[350px]">
                        <h3 className="font-display font-semibold text-sm tracking-tight mb-4 flex items-center space-x-2">
                          <span>Growth Chart Trends</span>
                        </h3>
                        <div className="flex-grow flex items-end justify-between px-4 pb-4">
                          {stats && stats.monthlyGrowth.length > 0 ? (
                            (() => {
                              const maxVal = Math.max(...stats.monthlyGrowth.map(m => m.count)) || 1;
                              return stats.monthlyGrowth.map((g) => {
                                const barPercent = Math.max(12, Math.round((g.count / maxVal) * 80));
                                return (
                                  <div key={g.month} className="flex flex-col items-center flex-grow space-y-2">
                                    <span className="font-mono text-xs font-bold text-brand-500">{g.count}</span>
                                    <div className="w-8 sm:w-12 bg-gradient-to-t from-brand-600 to-indigo-500 rounded-lg" style={{ height: `${barPercent}%` }} />
                                    <span className="text-[10px] text-slate-500 font-mono">{g.month}</span>
                                  </div>
                                );
                              });
                            })()
                          ) : (
                            <div className="mx-auto text-center py-10">
                              <p className="text-xs text-slate-500">Wait... Aggregate trends data processing</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Tag Cloud distribution */}
                      <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-col h-[350px]">
                        <h3 className="font-display font-semibold text-sm tracking-tight mb-3">Hot Topics & Label Tags cloud</h3>
                        <div className="flex-grow flex flex-wrap content-center gap-1.5 justify-center p-4">
                          {stats && stats.tagCloud.length > 0 ? (
                            stats.tagCloud.map(tc => (
                              <button
                                key={tc.text}
                                onClick={() => { setSelectedTag(tc.text); setActiveTab('contacts'); fetchContacts(); }}
                                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-900 hover:bg-brand-50 hover:text-brand-505 dark:hover:bg-brand-950/20 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-800 hover:border-brand-300 font-mono animate-pulse"
                              >
                                #{tc.text} ({tc.value})
                              </button>
                            ))
                          ) : (
                            <div className="text-center py-10 text-slate-500">
                              <Tag className="w-10 h-10 opacity-20 mx-auto mb-2" />
                              <p className="text-xs">No labels detected. Tag contacts with custom labels e.g. "VIP, relative, tech" to fill labels metrics.</p>
                            </div>
                          )}
                        </div>
                      </div>

                    </div>

                  </motion.div>
                )}

                {/* 4. SMART TOOLS & CSV UTILITY PANEL TAB */}
                {activeTab === 'tools' && (
                  <motion.div
                    key="tab-tools"
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    className="space-y-6"
                  >
                    
                    <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                      <h2 className="font-display font-medium text-2xl">Deduplication & Data Utilities</h2>
                      <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Utilize generative AI model scans to identify duplicate items and administer bulk transfers.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      
                      {/* CRM Data Import / Export */}
                      <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm flex flex-col space-y-4">
                        <h3 className="font-display font-bold text-sm tracking-tight">Bulk synchronization & backup</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Backup directories natively. Import values from standard comma-delimited headers: "Full Name, Mobile Number, Email Address, Company Name, Address, Category, Notes, Tags".
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                          
                          <button
                            onClick={() => exportContactsToCSV(contacts)}
                            className="p-3 bg-white hover:bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-brand-500 rounded-xl flex items-center justify-center space-x-2.5 text-xs font-semibold uppercase tracking-wider font-mono cursor-pointer transition-colors active:scale-98 shadow-sm"
                          >
                            <Download className="w-4 h-4 text-emerald-500" />
                            <span>Export CSV</span>
                          </button>

                          <button
                            onClick={() => exportToPDF(contacts)}
                            className="p-3 bg-white hover:bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 hover:border-brand-500 rounded-xl flex items-center justify-center space-x-2.5 text-xs font-semibold uppercase tracking-wider font-mono cursor-pointer transition-colors active:scale-98 shadow-sm"
                          >
                            <FileText className="w-4 h-4 text-indigo-500" />
                            <span>Export PDF / Print</span>
                          </button>

                          <div className="sm:col-span-2">
                            <label className="w-full p-4 border border-dashed border-slate-300 dark:border-slate-700 hover:border-brand-500 bg-slate-50/55 dark:bg-slate-900 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-850 transition-all text-center">
                              <Upload className="w-6 h-6 text-brand-500 mb-2" />
                              <span className="text-xs font-semibold">Click or Drop CSV File here</span>
                              <span className="text-[10px] text-slate-400 font-mono mt-1">Auto-mapping of contact headers</span>
                              <input
                                type="file"
                                accept=".csv"
                                onChange={triggerCSVImport}
                                className="hidden"
                              />
                            </label>
                          </div>

                        </div>
                      </div>

                      {/* AI Duplicate Scanner widget */}
                      <div className="glass-panel p-5 rounded-2xl border border-indigo-200/50 dark:border-indigo-900/30 bg-indigo-50/20 dark:bg-indigo-950/10 shadow-sm flex flex-col justify-between">
                        <div>
                          <h3 className="font-display font-medium text-base tracking-tight text-indigo-700 dark:text-indigo-300 flex items-center space-x-2">
                            <Sparkles className="w-4.5 h-4.5 text-indigo-500 animate-spin" />
                            <span>AI Deduplication Scanner</span>
                          </h3>
                          <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-2.5 leading-relaxed">
                            Scans full directory fields utilizing modern Gemini reasoning models contextually. Evaluates phonetics, typo variations, and email similarities to resolve entries.
                          </p>
                        </div>

                        <div className="mt-5">
                          <button
                            onClick={runDuplicateScan}
                            disabled={isCheckingDuplicates}
                            className="w-full bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl py-3 font-semibold text-xs tracking-wider uppercase font-mono shadow-md flex items-center justify-center space-x-2"
                          >
                            {isCheckingDuplicates ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Evaluating dataset...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                <span>Run AI Duplicate Checker</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Duplicate pairings list results */}
                    <div className="glass-panel p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-sm">
                      <h3 className="font-display font-semibold text-sm mb-4">Pending Duplicate Resolutions ({duplicateSuggestions.length})</h3>
                      
                      {duplicateSuggestions.length > 0 ? (
                        <div className="space-y-4">
                          {duplicateSuggestions.map((pair, index) => (
                            <div
                              key={index}
                              className="p-4 rounded-xl border border-orange-200 dark:border-amber-950/40 bg-orange-50/40 dark:bg-amber-950/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-fadeIn"
                            >
                              <div className="space-y-1.5 max-w-xl">
                                <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 font-mono px-2 py-0.5 rounded-md font-bold">
                                  {pair.score}% MATCH PROBABILITY
                                </span>
                                <h4 className="font-semibold text-sm">
                                  "{pair.contactA.fullName}" & "{pair.contactB.fullName}"
                                </h4>
                                <p className="text-xs text-slate-500 leading-relaxed font-mono">
                                  <strong>Reasoning:</strong> {pair.reason}
                                </p>
                              </div>

                              <div className="flex items-center space-x-2 shrink-0">
                                <button
                                  onClick={() => resolveDuplicateMerge(pair, 'A')}
                                  className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold rounded-lg font-mono tracking-wider text-slate-700 dark:text-slate-100 shadow border cursor-pointer uppercase"
                                >
                                  Keep {pair.contactA.fullName.split(' ')[0]}
                                </button>
                                <button
                                  onClick={() => resolveDuplicateMerge(pair, 'B')}
                                  className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-[11px] font-semibold rounded-lg font-mono tracking-wider text-slate-700 dark:text-slate-100 shadow border cursor-pointer uppercase"
                                >
                                  Keep {pair.contactB.fullName.split(' ')[0]}
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-slate-400">
                          <p className="text-xs">No pending duplicate pairs. Click scan above to execute evaluator.</p>
                        </div>
                      )}
                    </div>

                  </motion.div>
                )}

              </AnimatePresence>
            </main>

          </motion.div>
        )}
      </AnimatePresence>

      {/* ==========================================
          MODALS & FLOATING DIALOG LAYOUTS
         ========================================== */}
      
      {/* 1. ADD / EDIT CONTACT OVERLAY MODAL */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col my-8 max-h-[90vh]"
            >
              
              {/* Modal header */}
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
                <h3 className="font-display font-medium text-base">
                  {activeContactForEdit ? 'Edit Contact details' : 'Build New Contact profile'}
                </h3>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form body */}
              <form onSubmit={handleSaveContact} className="flex-grow overflow-y-auto p-6 space-y-4">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  
                  {/* Full Name */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Full Name*</label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="Diana Prince"
                    />
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Mobile number*</label>
                    <input
                      type="tel"
                      required
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="+1 (555) 019-2831"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Email Address*</label>
                    <input
                      type="email"
                      required
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="diana@wayne.co"
                    />
                  </div>

                  {/* Company */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Company name</label>
                    <input
                      type="text"
                      value={formCompany}
                      onChange={e => setFormCompany(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="Industries Group"
                    />
                  </div>

                  {/* Address */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Address</label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={e => setFormAddress(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500"
                      placeholder="1007 Mountain Drive, Gotham City"
                    />
                  </div>

                  {/* Drag & Drop Photo Area */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-2 leading-none">Profile Image</label>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      {formProfilePhoto ? (
                        <div className="relative shrink-0">
                          <img src={formProfilePhoto} alt="Draft avatar" className="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-800 shadow-inner" referrerPolicy="no-referrer" />
                          <button
                            type="button"
                            onClick={() => setFormProfilePhoto('')}
                            className="absolute -top-1 -right-1 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-1 shadow hover:scale-105 active:scale-95 transition-transform"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 border border-dashed text-xs shrink-0 font-mono">
                          No Photo
                        </div>
                      )}
                      
                      <div
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        className="flex-grow w-full border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center hover:border-brand-500 hover:bg-slate-50/50 dark:hover:bg-slate-900 cursor-pointer transition-colors text-center"
                      >
                        <Upload className="w-5 h-5 text-slate-400 mb-1" />
                        <span className="text-[11px] font-semibold">Drop or Click to upload avatar photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfilePhotoSelect}
                          className="hidden"
                          ref={fileInputRef}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="mt-1 text-[10px] text-brand-500 font-bold hover:underline font-mono"
                        >
                          Choose from computer
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Notes Context */}
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Biography / Notes (Context AI analysis)</label>
                    <textarea
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500 h-20"
                      placeholder="Met at tech conference. Collaborates on front-end. Mom's sister's cousin..."
                    />
                  </div>

                  {/* Category Suggesting AI assistant panel */}
                  <div className="sm:col-span-2 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-200/50 dark:border-indigo-900/30 p-4 rounded-xl flex items-center justify-between gap-3 flex-col sm:flex-row">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                        <span>AI Smart Category Advisor</span>
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Analyzes profile values and context notes to automatically assign the tag.
                      </p>
                    </div>
                    
                    <button
                      type="button"
                      disabled={isAiCategorizing}
                      onClick={runSmartCategorization}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg px-4 py-1.5 text-xs tracking-wider uppercase font-mono font-semibold shadow shrink-0 cursor-pointer flex items-center space-x-1"
                    >
                      {isAiCategorizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      <span>Auto Categorize</span>
                    </button>
                  </div>

                  {/* Suggested categorization explanation */}
                  {aiCategorizationResponse && (
                    <div className="sm:col-span-2 p-3 bg-indigo-100/30 dark:bg-indigo-950/20 border border-indigo-200/40 rounded-xl text-[10px] text-indigo-700 dark:text-indigo-300 font-mono flex items-start gap-1">
                      <Sparkle className="w-4 h-4 mt-0.5 shrink-0" />
                      <div>
                        <strong>Assigned Category: {aiCategorizationResponse.suggestedCategory} (Confidence: {Math.round(aiCategorizationResponse.confidence*100)}%)</strong>
                        <p className="mt-0.5 leading-relaxed">{aiCategorizationResponse.reasoning}</p>
                      </div>
                    </div>
                  )}

                  {/* Category selector */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Grouping category</label>
                    <select
                      value={formCategory}
                      onChange={e => setFormCategory(e.target.value as any)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500 font-semibold font-mono"
                    >
                      <option value="Family">Family</option>
                      <option value="Friends">Friends</option>
                      <option value="Work">Work</option>
                      <option value="Business">Business</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  {/* Tags */}
                  <div>
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1 leading-none">Label Tags (comma separated)</label>
                    <input
                      type="text"
                      value={formTags}
                      onChange={e => setFormTags(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-brand-500 font-mono"
                      placeholder="vip, developer, close-relative"
                    />
                  </div>

                  {/* Favorite indicator switch */}
                  <div className="sm:col-span-2 flex items-center justify-between p-3 border border-slate-105 rounded-xl">
                    <div className="flex items-center space-x-2.5">
                      <Heart className="w-5 h-5 text-amber-500 fill-amber-500" />
                      <div>
                        <span className="text-xs font-bold font-display">Priority Favorite</span>
                        <p className="text-[10px] text-slate-500 font-mono leading-none mt-0.5">Pins contact onto aggregate statistics favorite summaries.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIsFavorite}
                      onChange={e => setFormIsFavorite(e.target.checked)}
                      className="w-4 h-4 text-brand-500 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                    />
                  </div>

                </div>

                {/* Confirm footer action button */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end space-x-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 border rounded-xl text-xs font-semibold tracking-wider font-mono text-slate-500 dark:text-slate-400 hover:bg-slate-50 outline-none uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingForm}
                    className="px-5 py-2.2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold tracking-wider font-mono flex items-center space-x-1 uppercase cursor-pointer disabled:opacity-75"
                  >
                    {isSubmittingForm ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Check className="w-4.5 h-4.5" />}
                    <span>Save Contact</span>
                  </button>
                </div>

              </form>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. SPECIFIC CONTACT PROFILE VIEW DETAIL & GENERATE QR MODAL */}
      <AnimatePresence>
        {activeContactForDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            >
              
              <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 shrink-0">
                <h3 className="font-display font-medium text-base">Contact Sheet</h3>
                <button
                  onClick={() => { setActiveContactForDetail(null); setShowQRForContact(null); }}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Profile Details body */}
              <div className="p-6 space-y-5 overflow-y-auto">
                
                {/* Hero profile visual layout */}
                <div className="flex items-center space-x-4">
                  {activeContactForDetail.profilePhoto ? (
                    <img src={activeContactForDetail.profilePhoto} alt={activeContactForDetail.fullName} referrerPolicy="no-referrer" className="w-20 h-20 rounded-full object-cover border-2 border-brand-500 p-0.5 shadow shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl bg-gradient-to-tr from-brand-50 to-brand-100 text-brand-700 dark:from-brand-950/40 dark:to-indigo-950/40 dark:text-brand-300 font-mono shrink-0">
                      {getInitials(activeContactForDetail.fullName)}
                    </div>
                  )}

                  <div>
                    <h3 className="font-display font-bold text-xl flex items-center space-x-1.5 leading-none">
                      <span>{activeContactForDetail.fullName}</span>
                      {activeContactForDetail.isFavorite && <Heart className="w-5 h-5 text-amber-500 fill-amber-500 shrink-0" />}
                    </h3>
                    
                    {activeContactForDetail.companyName && (
                      <p className="text-xs text-slate-550 font-semibold font-mono mt-2 text-brand-600 dark:text-brand-400 flex items-center space-x-1">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>{activeContactForDetail.companyName}</span>
                      </p>
                    )}

                    <span className={`text-[9px] uppercase tracking-wider font-mono px-2.5 py-1 rounded-full border inline-block mt-3 ${getCategoryColorStyles(activeContactForDetail.category)}`}>
                      {activeContactForDetail.category}
                    </span>
                  </div>
                </div>

                {/* Attributes grid */}
                <div className="space-y-3.5 border-t border-b border-slate-100 dark:border-slate-800/60 py-4 font-mono text-xs">
                  
                  <div className="flex items-center space-x-3 text-slate-700 dark:text-slate-300">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 block -mb-0.5 uppercase">Mobile Number</span>
                      <strong>{activeContactForDetail.mobileNumber}</strong>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-slate-700 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[9px] text-slate-400 block -mb-0.5 uppercase">Email Address</span>
                      <strong>{activeContactForDetail.emailAddress}</strong>
                    </div>
                  </div>

                  {activeContactForDetail.address && (
                    <div className="flex items-center space-x-3 text-slate-700 dark:text-slate-300">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <div>
                        <span className="text-[9px] text-slate-400 block -mb-0.5 uppercase">Physical Address</span>
                        <strong>{activeContactForDetail.address}</strong>
                      </div>
                    </div>
                  )}

                  {activeContactForDetail.notes && (
                    <div className="flex items-start space-x-3 text-slate-700 dark:text-slate-300">
                      <FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-[9px] text-slate-400 block -mb-0.5 uppercase">Biography & context details</span>
                        <p className="font-sans text-xs mt-1 text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-xl border">
                          {activeContactForDetail.notes}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Render listed tags chips */}
                  {activeContactForDetail.tags.length > 0 && (
                    <div className="flex items-center space-x-3">
                      <Tag className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="flex flex-wrap gap-1">
                        {activeContactForDetail.tags.map(t => (
                          <span key={t} className="px-2 py-0.5 text-[9px] font-bold bg-slate-100 dark:bg-slate-800 rounded-md border text-slate-600 dark:text-slate-400">
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* QR sharer generator */}
                <div className="text-center pt-1">
                  {showQRForContact === activeContactForDetail.id ? (
                    <div className="animate-fadeIn space-y-2 border p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 max-w-xs mx-auto">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                          `MECARD:N:${activeContactForDetail.fullName};TEL:${activeContactForDetail.mobileNumber};EMAIL:${activeContactForDetail.emailAddress};NOTE:${activeContactForDetail.notes || ''};;`
                        )}`}
                        alt="Contact MECARD QR"
                        className="mx-auto border bg-white p-2.5 rounded-lg shadow-sm"
                      />
                      <p className="text-[10px] text-slate-500 font-mono">Scan on any mobile phone camera to instantly save contact details!</p>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowQRForContact(activeContactForDetail.id)}
                      className="px-5 py-2 hover:bg-slate-50 rounded-xl cursor-pointer font-mono font-bold text-xs border inline-flex items-center space-x-2 shadow-sm text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <Share2 className="w-4 h-4 text-brand-500" />
                      <span>View Sharing QR-code</span>
                    </button>
                  )}
                </div>

                {/* Modal footer operation toggles */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-end space-x-2 shrink-0">
                  <button
                    onClick={() => { openEditModal(activeContactForDetail); setActiveContactForDetail(null); }}
                    className="px-4 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 hover:border-brand-500 rounded-xl text-xs font-semibold tracking-wider font-mono border uppercase cursor-pointer"
                  >
                    Modify Card
                  </button>
                  <button
                    onClick={() => { setIsConfirmDeleteContactId(activeContactForDetail.id); }}
                    className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/20 dark:border-rose-900 rounded-xl text-xs font-semibold tracking-wider font-mono hover:bg-rose-100 uppercase cursor-pointer"
                  >
                    Delete contact
                  </button>
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3. CONFIRMATION DIALOG: DELETE SPECIFIC CONTACT */}
      <AnimatePresence>
        {isConfirmDeleteContactId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <div className="flex items-center space-x-3 text-rose-500">
                <AlertTriangle className="w-6 h-6 shrink-0 animate-bounce" />
                <h3 className="font-display font-semibold text-lg">Are you absolutely sure?</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                Deleting this contact is permanent. This cannot be undone and will immediately wipe details from metadata scopes.
              </p>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsConfirmDeleteContactId(null)}
                  className="px-4 py-2 border rounded-xl text-xs font-semibold tracking-wider font-mono text-slate-500 hover:bg-slate-50 uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeleteContact(isConfirmDeleteContactId)}
                  className="px-5 py-2 bg-rose-600 border border-rose-700 text-white rounded-xl text-xs font-semibold tracking-wider font-mono hover:bg-rose-505 uppercase cursor-pointer shadow-sm active:scale-95"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. CONFIRMATION DIALOG: BULK DELETE CONTACTS */}
      <AnimatePresence>
        {isBulkDeleteConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4"
            >
              <div className="flex items-center space-x-3 text-rose-500">
                <AlertTriangle className="w-6 h-6 shrink-0 animate-bounce" />
                <h3 className="font-display font-semibold text-lg">Confirm Bulk Deletion</h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
                You are about to bulk delete <strong>{selectedContactIds.length}</strong> contacts. All associated profile data will be permanently discarded.
              </p>
              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  onClick={() => setIsBulkDeleteConfirmOpen(false)}
                  className="px-4 py-2 border rounded-xl text-xs font-semibold tracking-wider font-mono text-slate-500 hover:bg-slate-50 uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-5 py-2 bg-rose-600 border border-rose-700 text-white rounded-xl text-xs font-semibold tracking-wider font-mono hover:bg-rose-505 uppercase cursor-pointer shadow-sm active:scale-95"
                >
                  Permanent Bulk Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==========================================
          FLOATING CUSTOM TOAST STACK SYSTEM
         ========================================== */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2.5 max-w-sm w-full pointer-events-none">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -20 }}
              className={`p-4 rounded-xl shadow-lg border pointer-events-auto flex items-center justify-between gap-3 text-xs font-mono select-none ${
                t.type === 'error'
                  ? 'bg-rose-100 border-rose-250 text-rose-800 dark:bg-rose-950/90 dark:text-rose-200 dark:border-rose-900/60'
                  : t.type === 'info'
                    ? 'bg-indigo-100 border-indigo-250 text-indigo-800 dark:bg-indigo-950/90 dark:text-indigo-200 dark:border-indigo-900/60'
                    : 'bg-emerald-100 border-emerald-250 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-200 dark:border-emerald-900/60'
              }`}
            >
              <span>{t.text}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
                className="opacity-75 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  );
}

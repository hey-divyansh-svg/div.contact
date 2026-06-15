import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db';
import { suggestCategorization, detectDuplicates, parseNaturalSearch } from './server/gemini';
import { Contact, ContactCategory } from './src/types';

// Load environment variables (.env files)
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'jwt-fallback-token-secret-classic-contactizer-2026';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Auth Middleware Definition
interface AuthenticatedRequest extends Request {
  userId?: string;
  email?: string;
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Token is missing.' });
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, decoded: any) => {
    if (err) {
      res.status(403).json({ error: 'Token is invalid or has expired.' });
      return;
    }
    req.userId = decoded.userId;
    req.email = decoded.email;
    next();
  });
}

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.post('/api/auth/signup', (req: Request, res: Response) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'Email, password, and full name are required.' });
      return;
    }

    const existingUser = db.findUserByEmail(email);
    if (existingUser) {
      res.status(400).json({ error: 'Email address is already in use.' });
      return;
    }

    const userId = 'u_' + Math.random().toString(36).substr(2, 9);
    const passwordHash = bcrypt.hashSync(password, 10);

    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      fullName,
      createdAt: new Date().toISOString(),
      passwordHash,
    };

    db.addUser(newUser);

    const token = jwt.sign({ userId, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        createdAt: newUser.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error during signup.' });
  }
});

app.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = db.findUserByEmail(email);
    if (!user) {
      res.status(400).json({ error: 'Invalid email or password.' });
      return;
    }

    const validPassword = bcrypt.compareSync(password, user.passwordHash);
    if (!validPassword) {
      res.status(400).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error during login.' });
  }
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = db.findUserById(req.userId!);
    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Internal server error.' });
  }
});

// ==========================================
// CONTACT MANAGEMENT ROUTES
// ==========================================

// Get all user contacts with search/filter/sort
app.get('/api/contacts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    let contacts = db.getUserContacts(userId);

    const { query, category, isFavorite, sortBy, sortOrder, tag } = req.query;

    // Filter by query (name, phone, email, notes, company)
    if (query) {
      const q = String(query).toLowerCase();
      contacts = contacts.filter(c =>
        c.fullName.toLowerCase().includes(q) ||
        c.mobileNumber.includes(q) ||
        c.emailAddress.toLowerCase().includes(q) ||
        (c.companyName && c.companyName.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q))
      );
    }

    // Filter by category
    if (category && category !== 'all') {
      contacts = contacts.filter(c => c.category === category);
    }

    // Filter by favorite status
    if (isFavorite === 'true') {
      contacts = contacts.filter(c => c.isFavorite);
    }

    // Filter by tag
    if (tag) {
      contacts = contacts.filter(c => c.tags.includes(String(tag)));
    }

    // Sorting alphabetically
    const order = sortOrder === 'desc' ? -1 : 1;
    if (sortBy === 'fullName' || !sortBy) {
      contacts.sort((a, b) => a.fullName.localeCompare(b.fullName) * order);
    } else if (sortBy === 'createdAt') {
      contacts.sort((a, b) => (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * order);
    }

    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error listing contacts.' });
  }
});

// Create Contact
app.post('/api/contacts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      fullName,
      mobileNumber,
      emailAddress,
      profilePhoto,
      companyName,
      address,
      notes,
      category,
      isFavorite,
      tags
    } = req.body;

    if (!fullName || !mobileNumber || !emailAddress) {
      res.status(400).json({ error: 'Full name, email address, and mobile number are required.' });
      return;
    }

    const contactId = 'c_' + Math.random().toString(36).substr(2, 9);
    const newContact: Contact = {
      id: contactId,
      userId,
      fullName,
      mobileNumber,
      emailAddress,
      profilePhoto: profilePhoto || '',
      companyName: companyName || '',
      address: address || '',
      notes: notes || '',
      category: category || 'Other',
      isFavorite: isFavorite || false,
      tags: tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.addContact(newContact);
    res.status(201).json(newContact);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error creating contact.' });
  }
});

// Update Contact
app.put('/api/contacts/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const contact = db.findContactById(id);
    if (!contact || contact.userId !== userId) {
      res.status(404).json({ error: 'Contact not found or unauthorized access.' });
      return;
    }

    const updated = db.updateContact(id, userId, req.body);
    if (!updated) {
      res.status(400).json({ error: 'Failed to update contact.' });
      return;
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error updating contact.' });
  }
});

// Delete Contact
app.delete('/api/contacts/:id', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const success = db.deleteContact(id, userId);
    if (!success) {
      res.status(404).json({ error: 'Contact not found or unauthorized.' });
      return;
    }

    res.json({ success: true, message: 'Contact successfully deleted.' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error deleting contact.' });
  }
});

// Bulk Delete Contacts
app.delete('/api/contacts', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { ids } = req.body; // Array of IDs

    if (!ids || !Array.isArray(ids)) {
      res.status(400).json({ error: 'An array of contact IDs is required.' });
      return;
    }

    const deletedCount = db.bulkDeleteContacts(ids, userId);
    res.json({ success: true, count: deletedCount, message: `${deletedCount} contacts successfully deleted in bulk.` });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error in bulk deleting contacts.' });
  }
});

// CSV Import contacts parser
app.post('/api/contacts/import', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { dataList } = req.body; // List of contact records parsed on client

    if (!dataList || !Array.isArray(dataList)) {
      res.status(400).json({ error: 'Expected an array of contact objects to import.' });
      return;
    }

    const imported: Contact[] = [];
    const now = new Date().toISOString();

    for (const raw of dataList) {
      if (!raw.fullName || !raw.mobileNumber) continue;

      const newContact: Contact = {
        id: 'c_' + Math.random().toString(36).substr(2, 9),
        userId,
        fullName: String(raw.fullName),
        mobileNumber: String(raw.mobileNumber),
        emailAddress: String(raw.emailAddress || ''),
        profilePhoto: String(raw.profilePhoto || ''),
        companyName: String(raw.companyName || ''),
        address: String(raw.address || ''),
        notes: String(raw.notes || ''),
        category: (raw.category && ['Family', 'Friends', 'Work', 'Business', 'Other'].includes(raw.category) ? raw.category : 'Other') as ContactCategory,
        isFavorite: !!raw.isFavorite,
        tags: Array.isArray(raw.tags) ? raw.tags : (raw.tags ? String(raw.tags).split(',').map((t: string) => t.trim()) : []),
        createdAt: now,
        updatedAt: now
      };

      db.addContact(newContact);
      imported.push(newContact);
    }

    res.json({ success: true, count: imported.length, contacts: imported });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'CSV Import processing failed.' });
  }
});

// Dashboard Statistics Overview Route
app.get('/api/contacts/stats', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const contacts = db.getUserContacts(userId);

    const totalContacts = contacts.length;
    const favoriteContacts = contacts.filter(c => c.isFavorite).length;

    // Categorization counts
    const categoryDistribution: Record<ContactCategory, number> = {
      Family: 0,
      Friends: 0,
      Work: 0,
      Business: 0,
      Other: 0,
    };
    contacts.forEach(c => {
      if (categoryDistribution[c.category] !== undefined) {
        categoryDistribution[c.category]++;
      } else {
        categoryDistribution['Other']++;
      }
    });

    // Tag counts for word cloud/tag cloud
    const tagCounts: Record<string, number> = {};
    contacts.forEach(c => {
      c.tags.forEach(t => {
        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const tagCloud = Object.entries(tagCounts)
      .map(([text, value]) => ({ text, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

    // Filter contacts created in the last 7 days
    const recentContacts = [...contacts]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    // Format Monthly growth chart data
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyGroups: Record<string, number> = {};

    contacts.forEach(c => {
      try {
        const d = new Date(c.createdAt);
        const key = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        monthlyGroups[key] = (monthlyGroups[key] || 0) + 1;
      } catch {
        // avoid failure on bad strings
      }
    });

    // Sort monthly groups chronologically or just render last 6 active
    const monthlyGrowth = Object.entries(monthlyGroups).map(([month, count]) => ({
      month,
      count
    })).slice(-6);

    // If empty fallback placeholder
    if (monthlyGrowth.length === 0) {
      monthlyGrowth.push({ month: monthNames[new Date().getMonth()], count: totalContacts });
    }

    res.json({
      totalContacts,
      favoriteContacts,
      recentContacts,
      categoryDistribution,
      monthlyGrowth,
      tagCloud
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error aggregating statistics.' });
  }
});

// ==========================================
// AI / GEMINI ROUTING ENDPOINTS
// ==========================================

// Suggest categorization of contact
app.post('/api/ai/categorize', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const contactDraft = req.body;
    const report = await suggestCategorization(contactDraft);
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini Categorization suggested process failed.' });
  }
});

// Detect duplicate entries on user list
app.post('/api/ai/duplicate-check', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const contacts = db.getUserContacts(userId);
    const duplicates = await detectDuplicates(contacts);
    res.json(duplicates);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini deduplication operation failed.' });
  }
});

// Parse natural searches to filter
app.post('/api/ai/natural-search', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phrase } = req.body;
    if (!phrase) {
       res.status(400).json({ error: 'Search phrase is required.' });
       return;
    }
    const filteredReport = await parseNaturalSearch(phrase);
    res.json(filteredReport);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Gemini NLP interpretation failed.' });
  }
});

// ==========================================
// VITE ASSETS & SPA MIDDLEWARE SETUP
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind to port 3000 to trigger the standard external ingress routes
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Contact Manager Server is listening on http://0.0.0.0:${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  });
}

startServer();

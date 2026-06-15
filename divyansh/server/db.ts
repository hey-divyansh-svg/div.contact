import fs from 'fs';
import path from 'path';
import { Contact, User } from '../src/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

interface UserRecord extends User {
  passwordHash: string;
}

interface Schema {
  users: UserRecord[];
  contacts: Contact[];
}

// Ensure the directory and file exist
function initializeDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData: Schema = { users: [], contacts: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readDb(): Schema {
  try {
    initializeDb();
    const rawData = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(rawData);
  } catch (err) {
    console.error('Error reading database file, returning structural fallback...', err);
    return { users: [], contacts: [] };
  }
}

function writeDb(data: Schema) {
  try {
    initializeDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing to database file...', err);
  }
}

export const db = {
  // Users
  getUsers(): UserRecord[] {
    return readDb().users;
  },

  findUserByEmail(email: string): UserRecord | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  },

  findUserById(id: string): UserRecord | undefined {
    return this.getUsers().find(u => u.id === id);
  },

  addUser(user: UserRecord): void {
    const schema = readDb();
    schema.users.push(user);
    writeDb(schema);
  },

  // Contacts
  getContacts(): Contact[] {
    return readDb().contacts;
  },

  getUserContacts(userId: string): Contact[] {
    return this.getContacts().filter(c => c.userId === userId);
  },

  findContactById(id: string): Contact | undefined {
    return this.getContacts().find(c => c.id === id);
  },

  addContact(contact: Contact): void {
    const schema = readDb();
    schema.contacts.push(contact);
    writeDb(schema);
  },

  updateContact(id: string, userId: string, updates: Partial<Omit<Contact, 'id' | 'userId' | 'createdAt'>>): Contact | null {
    const schema = readDb();
    const index = schema.contacts.findIndex(c => c.id === id && c.userId === userId);
    if (index === -1) return null;

    const existing = schema.contacts[index];
    const updated: Contact = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    schema.contacts[index] = updated;
    writeDb(schema);
    return updated;
  },

  deleteContact(id: string, userId: string): boolean {
    const schema = readDb();
    const initialLen = schema.contacts.length;
    schema.contacts = schema.contacts.filter(c => !(c.id === id && c.userId === userId));
    writeDb(schema);
    return schema.contacts.length < initialLen;
  },

  bulkDeleteContacts(ids: string[], userId: string): number {
    const schema = readDb();
    const initialLen = schema.contacts.length;
    schema.contacts = schema.contacts.filter(c => {
      if (c.userId !== userId) return true; // keep other users' contacts
      return !ids.includes(c.id); // discard matched contacts of this user
    });
    writeDb(schema);
    return initialLen - schema.contacts.length;
  }
};

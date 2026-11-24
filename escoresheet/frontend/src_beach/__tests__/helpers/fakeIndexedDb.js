// Import FIRST in a test file that needs the app's real Dexie database
// (db_beach): Dexie takes its IndexedDB when the database is constructed, at
// import time, and jsdom has none (fake-indexeddb/auto cannot redefine
// jsdom's indexedDB property). A fresh in-memory IndexedDB per test file.
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

Dexie.dependencies.indexedDB = new IDBFactory()
Dexie.dependencies.IDBKeyRange = IDBKeyRange

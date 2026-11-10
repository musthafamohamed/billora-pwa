import { db, getMeta, getProfile, saveProfile, setMeta, type SimpleBillDB } from '../db';
import { assertInvoiceWrite } from '../invoiceSaving';
import { decodeBackup, decodeCustomer, decodeInvoice, decodeProduct, requireDecoded } from './codecs';
import type { BillingRepository } from './repository';

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Adapter over the current v1 database. It never opens a second production
 * database, repairs stored records, or changes schema/IDs/snapshots. */
export function createDexieRepository(database: SimpleBillDB): BillingRepository {
  return {
    listProducts: async () => (await database.products.toArray()).map(p => requireDecoded(decodeProduct(p))).sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id)),
    upsertProduct: async product => { await database.products.put(requireDecoded(decodeProduct(product))); },
    deleteProduct: async id => { await database.products.delete(id); },
    listCustomers: async () => (await database.customers.toArray()).map(c => requireDecoded(decodeCustomer(c))).sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id)),
    upsertCustomer: async customer => { await database.customers.put(requireDecoded(decodeCustomer(customer))); },
    listInvoices: async () => (await database.invoices.toArray()).map(i => requireDecoded(decodeInvoice(i))).sort((a, b) => compare(b.issueDate, a.issueDate) || compare(b.id, a.id)),
    upsertInvoice: async invoice => {
      const next = requireDecoded(decodeInvoice(invoice));
      await database.transaction('rw', database.invoices, async () => {
        assertInvoiceWrite(await database.invoices.get(next.id), next);
        await database.invoices.put(next);
      });
    },
    deleteInvoice: async id => { await database.invoices.delete(id); },
    getProfile: () => getProfile(database),
    saveProfile: profile => saveProfile(profile, database),
    getMeta: key => getMeta(key, database),
    setMeta: (key, value) => setMeta(key, value, database),
    replaceAll: async value => {
      const data = requireDecoded(decodeBackup(value));
      await database.transaction('rw', [database.products, database.customers, database.invoices, database.meta], async () => {
        await database.products.clear(); await database.customers.clear(); await database.invoices.clear();
        await database.products.bulkPut(data.products); await database.customers.bulkPut(data.customers); await database.invoices.bulkPut(data.invoices);
        if (data.profile) await saveProfile(data.profile, database); else await database.meta.delete('profile');
      });
    },
  };
}
export const localRepository = createDexieRepository(db);

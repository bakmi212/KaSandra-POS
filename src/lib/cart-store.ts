import { create } from 'zustand';
import { supabase } from './supabase';
import type { CartItem, Product } from './types';

interface HeldCart {
  id: string;
  label: string;
  items: CartItem[];
  discount: number;
  customerId: string | null;
  createdAt: string;
}

interface CartState {
  items: CartItem[];
  discount: number;
  customerId: string | null;
  customerName: string;
  tableNumber: string;
  orderType: 'dine_in' | 'take_away' | 'delivery';
  orderNote: string;
  heldCarts: HeldCart[];
  add: (p: Product) => void;
  addByBarcode: (barcode: string, products: Product[]) => boolean;
  updateQty: (id: string, qty: number) => void;
  remove: (id: string) => void;
  clear: () => void;
  setDiscount: (d: number) => void;
  setCustomer: (id: string | null) => void;
  setCustomerName: (name: string) => void;
  setTableNumber: (table: string) => void;
  setOrderType: (type: 'dine_in' | 'take_away' | 'delivery') => void;
  setOrderNote: (note: string) => void;
  setItemDiscount: (id: string, discount: number, type: 'rp' | 'percent') => void;
  setItemNote: (id: string, note: string) => void;
  computeItemSubtotal: (item: CartItem) => number;
  hold: (createdBy?: string) => Promise<void>;
  loadHolds: () => Promise<void>;
  recall: (id: string) => Promise<void>;
  deleteHeld: (id: string) => Promise<void>;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discount: 0,
  customerId: null,
  customerName: '',
  tableNumber: '',
  orderType: 'dine_in',
  orderNote: '',
  heldCarts: [],

  computeItemSubtotal: (item) => {
    const base = item.qty * item.sell_price;
    let disc = 0;
    if (item.discountType === 'percent') {
      disc = (base * item.discount) / 100;
    } else {
      disc = Math.min(item.discount, base);
    }
    return Math.max(0, base - disc);
  },

  add: (p) => {
    const items = get().items;
    const existing = items.find((i) => i.product_id === p.id);
    if (existing) {
      if (existing.qty >= p.stock) return;
      const newQty = existing.qty + 1;
      const updated = { ...existing, qty: newQty };
      updated.subtotal = get().computeItemSubtotal(updated);
      set({ items: items.map((i) => (i.product_id === p.id ? updated : i)) });
    } else {
      if (p.stock <= 0) return;
      const newItem: CartItem = {
        product_id: p.id,
        name: p.name,
        barcode: p.barcode,
        sku: p.sku,
        qty: 1,
        sell_price: Number(p.selling_price) || Number(p.sell_price) || 0,
        cost_price: Number(p.purchase_price) || Number(p.cost_price) || 0,
        stock: p.stock,
        discount: 0,
        discountType: 'rp',
        note: '',
        subtotal: Number(p.selling_price) || Number(p.sell_price) || 0,
      };
      set({ items: [...items, newItem] });
    }
  },

  addByBarcode: (barcode, products) => {
    const p = products.find((x) => x.barcode === barcode || x.sku === barcode);
    if (!p) return false;
    get().add(p);
    return true;
  },

  updateQty: (id, qty) => {
    if (qty <= 0) {
      get().remove(id);
      return;
    }
    set({
      items: get().items.map((i) => {
        if (i.product_id === id) {
          const clamped = Math.min(qty, i.stock);
          const updated = { ...i, qty: clamped };
          updated.subtotal = get().computeItemSubtotal(updated);
          return updated;
        }
        return i;
      }),
    });
  },

  remove: (id) => set({ items: get().items.filter((i) => i.product_id !== id) }),

  clear: () => set({ items: [], discount: 0, customerId: null, customerName: '', tableNumber: '', orderType: 'dine_in', orderNote: '' }),

  setDiscount: (d) => set({ discount: Math.max(0, d) }),
  setCustomer: (id) => set({ customerId: id }),
  setCustomerName: (name) => set({ customerName: name }),
  setTableNumber: (table) => set({ tableNumber: table }),
  setOrderType: (type) => set({ orderType: type }),
  setOrderNote: (note) => set({ orderNote: note }),

  setItemDiscount: (id, discount, type) => {
    set({
      items: get().items.map((i) => {
        if (i.product_id === id) {
          const updated = { ...i, discount: Math.max(0, discount), discountType: type };
          updated.subtotal = get().computeItemSubtotal(updated);
          return updated;
        }
        return i;
      }),
    });
  },

  setItemNote: (id, note) => {
    set({
      items: get().items.map((i) => (i.product_id === id ? { ...i, note } : i)),
    });
  },

  hold: async (createdBy) => {
    const { items, discount, customerId, customerName, tableNumber, orderType, orderNote } = get();
    if (items.length === 0) return;
    const data = { items, discount, customerId, customerName, tableNumber, orderType, orderNote };
    const { error } = await supabase.from('sale_holds').insert({
      data_json: data,
      created_by: createdBy || null,
    });
    if (error) throw error;
    set({ items: [], discount: 0, customerId: null, customerName: '', tableNumber: '', orderType: 'dine_in', orderNote: '' });
    await get().loadHolds();
  },

  loadHolds: async () => {
    const { data, error } = await supabase
      .from('sale_holds')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return;
    const holds: HeldCart[] = (data || []).map((h: any) => ({
      id: h.id,
      label: `Hold - ${new Date(h.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`,
      items: h.data_json?.items || [],
      discount: h.data_json?.discount || 0,
      customerId: h.data_json?.customerId || null,
      customerName: h.data_json?.customerName || '',
      tableNumber: h.data_json?.tableNumber || '',
      orderType: h.data_json?.orderType || 'dine_in',
      orderNote: h.data_json?.orderNote || '',
      createdAt: h.created_at,
    }));
    set({ heldCarts: holds });
  },

  recall: async (id) => {
    const held = get().heldCarts.find((h) => h.id === id);
    if (!held) return;
    set({
      items: held.items,
      discount: held.discount,
      customerId: held.customerId,
      customerName: (held as any).customerName || '',
      tableNumber: (held as any).tableNumber || '',
      orderType: (held as any).orderType || 'dine_in',
      orderNote: (held as any).orderNote || '',
    });
    await supabase.from('sale_holds').delete().eq('id', id);
    await get().loadHolds();
  },

  deleteHeld: async (id) => {
    await supabase.from('sale_holds').delete().eq('id', id);
    await get().loadHolds();
  },
}));

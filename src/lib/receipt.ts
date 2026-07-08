import jsPDF from 'jspdf';
import { supabase } from './supabase';

export interface ReceiptData {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  footerNote: string;
  logoUrl?: string;
  invoiceNo: string;
  date: string;
  cashier: string;
  customer: string;
  orderType?: string;
  tableNumber?: string;
  orderNote?: string;
  items: { name: string; qty: number; price: number; discount: number; subtotal: number; note?: string }[];
  subtotal: number;
  discount: number;
  grandTotal: number;
  paymentMethod: string;
  amountPaid: number;
  changeAmount: number;
}

export async function getSettings(): Promise<any> {
  const { data } = await supabase.from('settings').select('*').limit(1).maybeSingle();
  return data || { store_name: 'KaSandra Store', address: '', phone: '', footer_note: 'Terima kasih', logo: null };
}

export function generateInvoiceNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const rand = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `INV-${ymd}-${rand}`;
}

export function buildReceiptHTML(opts: ReceiptData): string {
  const rows = opts.items
    .map((it) => {
      const noteLine = it.note ? `<div style="font-size:10px;color:#666;padding-left:8px;">  ${it.note}</div>` : '';
      const discLine = it.discount > 0
        ? `<div style="font-size:10px;color:#c0392b;padding-left:8px;">  Disc: -${it.discount.toLocaleString('id-ID')}</div>`
        : '';
      return `
      <div style="margin-top:4px;">
        <div style="font-size:12px;font-weight:bold;">${it.name}</div>
        <div style="display:flex;justify-content:space-between;font-size:11px;">
          <span>${it.qty} x ${it.price.toLocaleString('id-ID')}</span>
          <span>${it.subtotal.toLocaleString('id-ID')}</span>
        </div>
        ${noteLine}
        ${discLine}
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Struk ${opts.invoiceNo}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Courier New', monospace; width: 58mm; padding: 4mm; color:#000; background:#fff; }
    .center { text-align:center; }
    .store { font-size:14px; font-weight:bold; }
    .meta { font-size:10px; }
    .sep { border-top:1px dashed #000; margin:6px 0; }
    .row { display:flex; justify-content:space-between; font-size:11px; padding:1px 0; }
    .total { font-size:13px; font-weight:bold; border-top:1px solid #000; padding-top:4px; margin-top:4px; }
    .footer { text-align:center; font-size:10px; margin-top:8px; }
    @media print { body { width:58mm; } @page { margin:0; size:58mm auto; } }
  </style></head><body>
    <div class="center store">${opts.storeName}</div>
    <div class="center meta">${opts.storeAddress || ''}</div>
    <div class="center meta">${opts.storePhone || ''}</div>
    <div class="sep"></div>
    <div class="meta">No: ${opts.invoiceNo}</div>
    <div class="meta">Tgl: ${opts.date}</div>
    <div class="meta">Kasir: ${opts.cashier}</div>
    ${opts.customer ? `<div class="meta">Plgn: ${opts.customer}</div>` : ''}
    ${opts.orderType ? `<div class="meta">Tipe: ${opts.orderType === 'dine_in' ? 'Dine In' : opts.orderType === 'take_away' ? 'Take Away' : 'Delivery'}${opts.tableNumber ? ' / Meja ' + opts.tableNumber : ''}</div>` : ''}
    ${opts.orderNote ? `<div class="meta">Catatan: ${opts.orderNote}</div>` : ''}
    <div class="sep"></div>
    ${rows}
    <div class="sep"></div>
    <div class="row"><span>Subtotal</span><span>${opts.subtotal.toLocaleString('id-ID')}</span></div>
    ${opts.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${opts.discount.toLocaleString('id-ID')}</span></div>` : ''}
    <div class="row total"><span>TOTAL</span><span>${opts.grandTotal.toLocaleString('id-ID')}</span></div>
    <div class="sep"></div>
    <div class="row"><span>Bayar (${opts.paymentMethod})</span><span>${opts.amountPaid.toLocaleString('id-ID')}</span></div>
    <div class="row"><span>Kembalian</span><span>${opts.changeAmount.toLocaleString('id-ID')}</span></div>
    <div class="footer">${opts.footerNote}</div>
  </body></html>`;
}

export function printReceipt(html: string) {
  const w = window.open('', '_blank', 'width=320,height=600');
  if (!w) {
    alert('Pop-up diblokir. Izinkan pop-up untuk mencetak struk.');
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => {
    w.print();
    w.close();
  }, 400);
}

export function downloadReceiptPDF(opts: ReceiptData) {
  const doc = new jsPDF({ unit: 'mm', format: [58, 200] });
  let y = 6;
  const cx = 29; // center x for 58mm
  const left = 4;
  const right = 54;

  const center = (text: string, size = 10, bold = false) => {
    doc.setFontSize(size);
    if (bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    doc.text(text, cx, y, { align: 'center' });
    y += size * 0.4 + 1;
  };

  const line = (label: string, value: string, size = 9) => {
    doc.setFontSize(size);
    doc.setFont('helvetica', 'normal');
    doc.text(label, left, y);
    doc.text(value, right, y, { align: 'right' });
    y += size * 0.4 + 1;
  };

  const sep = () => {
    doc.setLineDashPattern([1, 1], 0);
    doc.line(left, y, right, y);
    y += 2;
  };

  center(opts.storeName, 12, true);
  if (opts.storeAddress) center(opts.storeAddress, 8);
  if (opts.storePhone) center(opts.storePhone, 8);
  sep();
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`No: ${opts.invoiceNo}`, left, y); y += 4;
  doc.text(`Tgl: ${opts.date}`, left, y); y += 4;
  doc.text(`Kasir: ${opts.cashier}`, left, y); y += 4;
  if (opts.customer) { doc.text(`Plgn: ${opts.customer}`, left, y); y += 4; }
  if (opts.orderType) {
    const typeLabel = opts.orderType === 'dine_in' ? 'Dine In' : opts.orderType === 'take_away' ? 'Take Away' : 'Delivery';
    doc.text(`Tipe: ${typeLabel}${opts.tableNumber ? ' / Meja ' + opts.tableNumber : ''}`, left, y); y += 4;
  }
  if (opts.orderNote) { doc.text(`Catatan: ${opts.orderNote}`, left, y); y += 4; }
  sep();

  opts.items.forEach((it) => {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(it.name.slice(0, 24), left, y); y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`${it.qty} x ${it.price.toLocaleString('id-ID')}`, left, y);
    doc.text(it.subtotal.toLocaleString('id-ID'), right, y, { align: 'right' });
    y += 3;
    if (it.discount > 0) {
      doc.setTextColor(150, 0, 0);
      doc.text(`  Disc: -${it.discount.toLocaleString('id-ID')}`, left, y);
      doc.setTextColor(0, 0, 0);
      y += 3;
    }
    if (it.note) {
      doc.setTextColor(100, 100, 100);
      doc.text(`  ${it.note.slice(0, 28)}`, left, y);
      doc.setTextColor(0, 0, 0);
      y += 3;
    }
  });
  sep();
  line('Subtotal', opts.subtotal.toLocaleString('id-ID'));
  if (opts.discount > 0) line('Diskon', `-${opts.discount.toLocaleString('id-ID')}`);
  sep();
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL', left, y);
  doc.text(opts.grandTotal.toLocaleString('id-ID'), right, y, { align: 'right' });
  y += 5;
  sep();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  line(`Bayar (${opts.paymentMethod})`, opts.amountPaid.toLocaleString('id-ID'));
  line('Kembalian', opts.changeAmount.toLocaleString('id-ID'));
  y += 2;
  sep();
  doc.setFontSize(8);
  doc.text(opts.footerNote, cx, y, { align: 'center' });

  doc.save(`struk-${opts.invoiceNo}.pdf`);
}

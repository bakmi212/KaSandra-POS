// ============================================================
// CORE TYPES — Catering Management Platform
// ============================================================

// Extended Roles for Catering
export type CateringRole =
  | 'super_admin'
  | 'owner'
  | 'branch_manager'
  | 'kitchen_manager'
  | 'chef'
  | 'admin'
  | 'staff'
  | 'kasir'
  | 'cashier'
  | 'delivery_staff'
  | 'customer_service'
  | 'finance';

export type Role = CateringRole | 'owner' | 'admin' | 'staff' | 'kasir';

// ============================================================
// USER & PROFILE
// ============================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  jabatan: string | null;
  is_active: boolean;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

// ============================================================
// BRANCH & KITCHEN
// ============================================================

export interface Branch {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
}

export interface Kitchen {
  id: string;
  branch_id: string | null;
  name: string;
  code: string;
  type: 'main' | 'prep' | 'packaging' | 'delivery_hub';
  capacity_per_day: number;
  current_load: number;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
  branch?: Branch | null;
}

export interface KitchenStaff {
  id: string;
  kitchen_id: string;
  user_id: string;
  role: 'manager' | 'chef' | 'prep' | 'staff';
  is_active: boolean;
  created_at: string;
  kitchen?: Kitchen | null;
  profile?: Profile | null;
}

// ============================================================
// DELIVERY STAFF
// ============================================================

export interface DeliveryStaff {
  id: string;
  user_id: string | null;
  name: string;
  phone: string;
  vehicle_type: 'motorcycle' | 'car' | 'van' | 'truck' | null;
  vehicle_plate: string | null;
  is_active: boolean;
  current_location: { lat: number; lng: number } | null;
  last_location_update: string | null;
  created_at: string;
}

// ============================================================
// CATEGORY & PRODUCT
// ============================================================

export interface Category {
  id: string;
  name: string;
  description: string;
  color: string;
  created_at: string;
  product_count?: number;
}

export interface Product {
  id: string;
  barcode: string | null;
  sku: string | null;
  name: string;
  category_id: string | null;
  cost_price: number;
  sell_price: number;
  purchase_price: number;
  selling_price: number;
  stock: number;
  min_stock: number;
  minimum_stock: number;
  unit: string;
  photo_url: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category | null;
}

// ============================================================
// CUSTOMER
// ============================================================

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string;
  notes: string | null;
  created_at: string;
}

// ============================================================
// ORDER (Catering Order - Extended from Sale)
// ============================================================

export interface CateringOrder {
  id: string;
  order_number: string;
  customer_id: string | null;
  branch_id: string | null;
  kitchen_id: string | null;
  order_type: 'delivery' | 'pickup' | 'dine_in';
  order_date: string;
  delivery_date: string | null;
  delivery_address: string | null;
  delivery_fee: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid: number;
  status: 'draft' | 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivering' | 'completed' | 'cancelled';
  payment_status: 'unpaid' | 'partial' | 'paid';
  payment_method: 'cash' | 'transfer' | 'qris' | 'ewallet' | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer | null;
  branch?: Branch | null;
  kitchen?: Kitchen | null;
  items?: CateringOrderItem[];
}

export interface CateringOrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  notes: string | null;
  product?: Product | null;
}

// ============================================================
// DELIVERY
// ============================================================

export interface Delivery {
  id: string;
  delivery_number: string;
  order_id: string;
  driver_id: string | null;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed';
  pickup_address: string;
  delivery_address: string;
  pickup_time: string | null;
  delivery_time: string | null;
  notes: string | null;
  created_at: string;
  order?: CateringOrder | null;
  driver?: DeliveryStaff | null;
}

// ============================================================
// SUPPLIER & PURCHASE
// ============================================================

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  contact_name: string | null;
  phone: string;
  email: string | null;
  address: string;
  notes: string | null;
  payable: number;
  created_at: string;
}

export interface Purchase {
  id: string;
  invoice_no: string;
  purchase_number: string | null;
  supplier_id: string | null;
  purchase_date: string | null;
  total: number;
  paid: number;
  status: string;
  note: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  supplier?: Supplier | null;
  purchase_items?: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string | null;
  quantity: number;
  received_quantity: number;
  purchase_price: number;
  discount: number;
  subtotal: number;
  created_at: string;
  product?: Product | null;
}

// ============================================================
// STOCK
// ============================================================

export interface StockMovement {
  id: string;
  product_id: string;
  type: string;
  qty: number;
  reference: string;
  note: string;
  balance_before: number;
  balance_after: number;
  created_at: string;
  created_by: string | null;
  product?: Product | null;
}

export interface BranchStock {
  id: string;
  branch_id: string;
  product_id: string;
  stock: number;
  min_stock: number;
  updated_at: string;
}

export interface BranchUser {
  id: string;
  branch_id: string;
  user_id: string;
  created_at: string;
  branch?: Branch | null;
  profile?: Profile | null;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  from_branch_id: string;
  to_branch_id: string;
  status: 'draft' | 'dikirim' | 'diterima' | 'dibatalkan';
  notes: string;
  created_by: string | null;
  created_at: string;
  fromBranch?: Branch | null;
  toBranch?: Branch | null;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  product?: Product | null;
}

// ============================================================
// FINANCE
// ============================================================

export interface CashAccount {
  id: string;
  name: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  created_at: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  type: 'pendapatan' | 'pengeluaran';
  created_at: string;
}

export interface CashTransaction {
  id: string;
  type: 'masuk' | 'keluar';
  transaction_type: 'masuk' | 'keluar' | 'transfer' | null;
  account_id: string | null;
  category_id: string | null;
  amount: number;
  description: string;
  reference: string;
  reference_number: string | null;
  attachment: string | null;
  created_at: string;
  created_by: string | null;
  account?: CashAccount | null;
  category?: FinanceCategory | null;
}

export interface CashTransfer {
  id: string;
  from_account: string;
  to_account: string;
  amount: number;
  notes: string;
  created_by: string | null;
  created_at: string;
  fromAccount?: CashAccount | null;
  toAccount?: CashAccount | null;
}

// ============================================================
// NOTIFICATIONS
// ============================================================

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  data: Record<string, any> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationTemplate {
  id: string;
  code: string;
  name: string;
  type: 'in_app' | 'push' | 'email' | 'whatsapp' | 'sms';
  subject: string | null;
  body: string;
  variables: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationQueue {
  id: string;
  template_code: string;
  recipient_type: 'user' | 'customer' | 'email' | 'phone';
  recipient_id: string | null;
  recipient_email: string | null;
  recipient_phone: string | null;
  variables: Record<string, any>;
  status: 'pending' | 'processing' | 'sent' | 'failed';
  error_message: string | null;
  retry_count: number;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

// ============================================================
// SETTINGS
// ============================================================

export interface AppSetting {
  id: string;
  category: string;
  key: string;
  value: string | null;
  value_json: Record<string, any> | null;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
  updated_by: string | null;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  store_name: string;
  logo: string | null;
  address: string;
  phone: string;
  email: string | null;
  currency: string;
  footer_note: string;
  created_at: string;
}

// ============================================================
// CART & PAYMENT
// ============================================================

export interface CartItem {
  product_id: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  qty: number;
  sell_price: number;
  cost_price: number;
  stock: number;
  discount: number;
  discountType: 'rp' | 'percent';
  note: string;
  subtotal: number;
}

export interface Payment {
  id: string;
  sale_id: string;
  method: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  amount: number;
  reference_number: string;
  created_at: string;
}

// ============================================================
// SALE (POS Sales)
// ============================================================

export interface Sale {
  id: string;
  invoice_no: string;
  invoice_number: string | null;
  customer_id: string | null;
  cashier_id: string | null;
  subtotal: number;
  discount: number;
  total: number;
  grand_total: number;
  paid: number;
  amount_paid: number;
  change: number;
  change_amount: number;
  payment_method: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  status: 'selesai' | 'hold' | 'retur';
  note: string;
  notes: string | null;
  created_at: string;
  customer?: Customer | null;
  sale_items?: SaleItem[];
  payments?: Payment[];
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  quantity: number;
  cost_price: number;
  sell_price: number;
  price: number;
  discount: number;
  subtotal: number;
  created_at: string;
}

// ============================================================
// AUDIT LOG
// ============================================================

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  module: string;
  activity: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

// ============================================================
// API RESPONSE TYPES
// ============================================================

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================
// PERMISSIONS
// ============================================================

export interface Permission {
  key: string;
  label: string;
  category: string;
}

export interface RolePermission {
  role: Role;
  page_key: string;
  allowed: boolean;
}

// ============================================================
// CONFIGURATION TYPES
// ============================================================

export interface AppConfig {
  business: {
    name: string;
    logo: string | null;
    currency: string;
    timezone: string;
    language: string;
    address: string;
    phone: string;
    email: string | null;
  };
  order: {
    minOrderAmount: number;
    orderNumberPrefix: string;
    autoConfirmOrder: boolean;
    leadTimeHours: number;
  };
  delivery: {
    deliveryFeeBase: number;
    deliveryFeePerKm: number;
    maxDeliveryRadiusKm: number;
    deliveryNumberPrefix: string;
  };
  production: {
    kitchenPrepBufferHours: number;
    batchProductionEnabled: boolean;
  };
  notification: {
    pushEnabled: boolean;
    emailEnabled: boolean;
    whatsappEnabled: boolean;
    notifyNewOrder: boolean;
    notifyOrderConfirmed: boolean;
    notifyOrderReady: boolean;
    notifyDeliveryStarted: boolean;
    notifyDeliveryCompleted: boolean;
  };
}

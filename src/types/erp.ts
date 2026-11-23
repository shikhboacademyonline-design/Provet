export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface ChartAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subType: string;
  openingDebit: number;
  openingCredit: number;
}

export interface JournalLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface JournalEntry {
  id: string;
  voucherNo: string;
  voucherType: 'Receipt' | 'Payment' | 'Journal' | 'Contra' | 'Sales' | 'Purchase' | 'Return' | 'Damage' | 'Payroll' | 'Opening';
  date: string; // YYYY-MM-DD
  reference?: string;
  partyName?: string;
  narration: string;
  lines: JournalLine[];
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  address: string;
  mobile: string;
  telephone: string;
  email: string;
  openingBalance: number; // Positive means payable to supplier
  createdAt: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  address: string;
  mobile: string;
  telephone: string;
  email: string;
  creditLimit: number;
  openingBalance: number; // Positive means receivable from customer
  createdAt: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  supplierId: string;
  supplierName: string;
  group: string;
  category: string;
  location: string;
  unit: string;
  stockQty: number;
  weightedAvgCost: number; // Calculated via Weighted Average Method
  salesPrice: number;
  reorderLevel: number;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  date: string;
  refNo: string;
  type: 'Opening' | 'Purchase' | 'Sale' | 'Bonus' | 'Sales Return' | 'Purchase Return' | 'Transfer Out' | 'Transfer In' | 'Damage';
  productId: string;
  productName: string;
  location: string;
  inQty: number;
  outQty: number;
  unitCost: number; // Weighted Avg or Purchase Cost
  totalValue: number;
  notes?: string;
}

export interface StockRequisition {
  id: string;
  reqNo: string;
  date: string;
  department: string;
  requestedBy: string;
  status: 'Pending' | 'Approved' | 'Issued';
  items: { productId: string; productName: string; qty: number; location: string }[];
  notes: string;
}

export interface StockTransfer {
  id: string;
  transferNo: string;
  date: string;
  productId: string;
  productName: string;
  fromLocation: string;
  toLocation: string;
  qty: number;
  notes: string;
}

export interface DamagedRecord {
  id: string;
  damageNo: string;
  date: string;
  productId: string;
  productName: string;
  location: string;
  qty: number;
  unitCost: number;
  totalLoss: number;
  reason: string;
}

export interface PurchaseLine {
  productId: string;
  productName: string;
  qty: number;
  unitCost: number;
  discount: number;
  total: number;
}

export interface PurchaseRequisition {
  id: string;
  prNo: string;
  date: string;
  requestedBy: string;
  department: string;
  status: 'Pending' | 'Approved' | 'Ordered';
  items: PurchaseLine[];
  notes: string;
}

export interface PurchaseQuotation {
  id: string;
  quotNo: string;
  date: string;
  validUntil: string;
  supplierId: string;
  supplierName: string;
  items: PurchaseLine[];
  totalAmount: number;
  notes: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  paymentType: 'Cash' | 'Bank' | 'Credit';
  dueDate?: string;
  items: PurchaseLine[];
  subTotal: number;
  discountAmount: number;
  netAmount: number;
  paidAmount: number;
  notes: string;
}

export interface PurchaseReturn {
  id: string;
  returnNo: string;
  date: string;
  supplierId: string;
  supplierName: string;
  invoiceRef?: string;
  items: PurchaseLine[];
  totalAmount: number;
  reason: string;
}

export interface SalesLine {
  productId: string;
  productName: string;
  qty: number;
  bonusQty: number;
  bonusProductName?: string;
  salesPrice: number;
  discountPercent: number;
  discountAmount: number;
  lineTotal: number;
  costAtSale?: number; // Weighted Avg Cost * (qty + bonusQty)
}

export interface SalesQuotation {
  id: string;
  quotNo: string;
  date: string;
  validUntil: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  items: SalesLine[];
  totalAmount: number;
  notes: string;
}

export interface SaleOrder {
  id: string;
  orderNo: string;
  date: string;
  deliveryDate: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  items: SalesLine[];
  totalAmount: number;
  status: 'Confirmed' | 'Challan Created' | 'Completed';
  notes: string;
}

export type PermissionKey =
  | 'dashboard'
  | 'stock'
  | 'purchase'
  | 'sales'
  | 'account'
  | 'reports'
  | 'hr';

export interface ERPUser {
  id: string;
  userId: string;
  fullName: string;
  role: 'Admin' | 'Staff';
  permissions: PermissionKey[];
  active: boolean;
  createdAt: string;
}

export interface SalesChallan {
  id: string;
  challanNo: string;
  invoiceNo: string;
  deliveryChallanNo: string;
  date: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerMobile: string;
  customerEmail: string;
  items: SalesLine[];
  subTotal: number;
  totalDiscount: number;
  netAmount: number;
  paymentTerms: 'Cash' | 'Credit';
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Cheque' | 'Mobile Banking';
  paymentPeriodDays: number;
  dueDate: string;
  paidAmount: number;
  otherTerms?: string;
  notes: string;
}

export interface SalesReturn {
  id: string;
  returnNo: string;
  date: string;
  customerId: string;
  customerName: string;
  challanRef?: string;
  items: SalesLine[];
  totalAmount: number;
  reason: string;
}

export interface Employee {
  id: string;
  empCode: string;
  name: string;
  designation: string;
  department: string;
  phone: string;
  email: string;
  joinDate: string;
  basicSalary: number;
  houseRent: number;
  medicalAllowance: number;
  transportAllowance: number;
  bankAccount: string;
  status: 'Active' | 'On Leave' | 'Inactive';
}

export interface AttendanceRecord {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  department: string;
  status: 'Present' | 'Late' | 'Absent' | 'Leave';
  checkIn?: string;
  checkOut?: string;
}

export interface LeaveRequest {
  id: string;
  empId: string;
  employeeName: string;
  department: string;
  leaveType: 'Annual' | 'Sick' | 'Casual';
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}

export interface PayrollEntry {
  employeeId: string;
  empCode: string;
  employeeName: string;
  designation: string;
  department: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  deductions: number;
  netSalary: number;
}

export interface PayrollRun {
  id: string;
  runNo: string;
  month: string; // YYYY-MM
  date: string;
  paymentMethod: 'Bank Transfer' | 'Cash';
  entries: PayrollEntry[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  postedToAccounts: boolean;
  voucherNo?: string;
}

export interface ERPDatabase {
  company: {
    name: string;
    tagline: string;
    address: string;
    phone: string;
    email: string;
    currency: string;
  };
  accounts: ChartAccount[];
  journalEntries: JournalEntry[];
  suppliers: Supplier[];
  customers: Customer[];
  products: Product[];
  stockMovements: StockMovement[];
  stockRequisitions: StockRequisition[];
  stockTransfers: StockTransfer[];
  damagedRecords: DamagedRecord[];
  purchaseRequisitions: PurchaseRequisition[];
  purchaseQuotations: PurchaseQuotation[];
  purchaseInvoices: PurchaseInvoice[];
  purchaseReturns: PurchaseReturn[];
  salesQuotations: SalesQuotation[];
  saleOrders: SaleOrder[];
  salesChallans: SalesChallan[];
  salesReturns: SalesReturn[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  leaves: LeaveRequest[];
  payrollRuns: PayrollRun[];
}

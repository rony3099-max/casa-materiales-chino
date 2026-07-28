const STORAGE_KEY = "el_chino_pos_data_v1";
const SESSION_KEY = "el_chino_pos_session_v1";
const LOW_STOCK_LIMIT = 10;
const SUPABASE_URL = "https://acmqxejmvuvohpdpteym.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_ZH44taVqGdXJHYsoOG5KVA_mzq5cRxY";
const SELLER_VIEWS = ["ventas", "fiado", "historial"];
const REQUIRE_LOGIN_ON_OPEN = true;
const supabaseClient = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function uid() {
  return globalThis.crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const seedData = {
  products: [
    { id: uid(), code: "CEM-50", name: "Cemento gris 50 kg", category: "Cementos", price: 245, stock: 42, unit: "bulto" },
    { id: uid(), code: "VAR-38", name: "Varilla 3/8", category: "Acero", price: 168, stock: 80, unit: "varilla" },
    { id: uid(), code: "ARE-M3", name: "Arena cribada", category: "Agregados", price: 520, stock: 12, unit: "tonelada" },
    { id: uid(), code: "GRA-M3", name: "Grava", category: "Agregados", price: 560, stock: 9, unit: "tonelada" },
    { id: uid(), code: "TAB-R", name: "Tabique rojo", category: "Block y tabique", price: 5.5, stock: 1300, unit: "pieza" },
    { id: uid(), code: "PVC-12", name: "Tubo PVC 1/2", category: "Plomería", price: 82, stock: 25, unit: "pieza" },
    { id: uid(), code: "CAL-25", name: "Cal hidratada 25 kg", category: "Cementos", price: 118, stock: 7, unit: "bulto" },
    { id: uid(), code: "PINT-19", name: "Pintura vinílica 19 L", category: "Pinturas", price: 780, stock: 11, unit: "litro" }
  ],
  sales: [],
  credits: [],
  payments: []
};

const yesterday = new Date(Date.now() - 86400000);
const twoDaysAgo = new Date(Date.now() - 172800000);
seedData.sales = [
  makeSeedSale("T-1001", yesterday, "Efectivo", [
    { name: "Cemento gris 50 kg", qty: 4, price: 245, unit: "bulto" },
    { name: "Tabique rojo", qty: 120, price: 5.5, unit: "pieza" }
  ]),
  makeSeedSale("T-1002", twoDaysAgo, "Transferencia", [
    { name: "Varilla 3/8", qty: 8, price: 168, unit: "varilla" }
  ])
];
seedData.credits = [
  {
    id: uid(),
    saleId: null,
    customer: "Don Mateo García",
    phone: "555 123 8899",
    itemsText: "2 bultos de cemento, 40 tabiques",
    amount: 710,
    date: toDateInput(yesterday),
    notes: "Paga el sábado",
    status: "pendiente",
    paidAt: null
  }
];

let state = loadData();
let cart = [];
let creditCart = [];
let currentTicket = "";
let currentSale = null;
let currentUser = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => Number(value || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const number = (value) => Number(value || 0).toLocaleString("es-MX", { maximumFractionDigits: 2 });

function makeSeedSale(ticket, date, paymentMethod, rawItems) {
  const items = rawItems.map((item) => ({ ...item, id: uid(), productId: null, subtotal: item.qty * item.price }));
  const total = items.reduce((sum, item) => sum + item.subtotal, 0);
  return {
    id: uid(),
    ticket,
    date: date.toISOString(),
    customer: "Mostrador",
    paymentMethod,
    status: "pagado",
    paidAt: date.toISOString(),
    items,
    total
  };
}

function loadData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
    return structuredClone(seedData);
  }
  return JSON.parse(saved);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (currentUser && supabaseClient) {
    syncToSupabase().catch((error) => showToast(`No se pudo sincronizar: ${error.message}`));
  }
}

async function loadFromSupabase() {
  const [
    productsResult,
    salesResult,
    itemsResult,
    creditsResult,
    paymentsResult
  ] = await Promise.all([
    supabaseClient.from("products").select("*").order("name"),
    supabaseClient.from("sales").select("*").order("sale_date", { ascending: true }),
    supabaseClient.from("sale_items").select("*"),
    supabaseClient.from("credits").select("*").order("credit_date", { ascending: true }),
    supabaseClient.from("credit_payments").select("*").order("paid_at", { ascending: true })
  ]);

  const firstError = [productsResult, salesResult, itemsResult, creditsResult, paymentsResult].find((result) => result.error)?.error;
  if (firstError) {
    showToast(`No se pudo cargar Supabase: ${firstError.message}`);
    return;
  }

  const itemsBySale = groupBy(itemsResult.data || [], (item) => item.sale_id);
  state = {
    products: (productsResult.data || []).map((product) => ({
      id: product.id,
      code: product.code,
      name: product.name,
      category: product.category,
      price: Number(product.price),
      stock: Number(product.stock),
      unit: product.unit
    })),
    sales: (salesResult.data || []).map((sale) => ({
      id: sale.id,
      ticket: sale.ticket,
      date: sale.sale_date,
      customer: sale.customer,
      paymentMethod: sale.payment_method,
      status: sale.status,
      paidAt: sale.paid_at,
      total: Number(sale.total),
      items: (itemsBySale[sale.id] || []).map((item) => ({
        id: item.id,
        productId: item.product_id,
        name: item.product_name,
        unit: item.unit,
        qty: Number(item.qty),
        price: Number(item.price),
        subtotal: Number(item.subtotal)
      }))
    })),
    credits: (creditsResult.data || []).map((credit) => ({
      id: credit.id,
      saleId: credit.sale_id,
      customer: credit.customer,
      phone: credit.phone || "",
      itemsText: credit.items_text,
      amount: Number(credit.amount),
      date: credit.credit_date,
      notes: credit.notes || "",
      status: credit.status,
      paidAt: credit.paid_at
    })),
    payments: (paymentsResult.data || []).map((payment) => ({
      id: payment.id,
      creditId: payment.credit_id,
      amount: Number(payment.amount),
      method: payment.method,
      date: payment.paid_at
    }))
  };

  if (!state.products.length && isAdmin()) {
    state.products = structuredClone(seedData.products);
    await syncToSupabase();
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function syncToSupabase() {
  if (!supabaseClient || !currentUser) return;

  const products = state.products.map((product) => ({
    id: product.id,
    code: product.code,
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    unit: product.unit
  }));
  if (products.length) await throwOnError(supabaseClient.from("products").upsert(products));

  for (const sale of state.sales) {
    await throwOnError(supabaseClient.from("sales").upsert({
      id: sale.id,
      ticket: sale.ticket,
      customer: sale.customer || "Mostrador",
      payment_method: sale.paymentMethod,
      status: sale.status,
      total: sale.total,
      sale_date: sale.date,
      paid_at: sale.paidAt,
      created_by: currentUser.id
    }));

    const saleItems = sale.items.map((item) => ({
      id: item.id || uid(),
      sale_id: sale.id,
      product_id: item.productId,
      product_name: item.name,
      unit: item.unit,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal
    }));
    sale.items = saleItems.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      unit: item.unit,
      qty: item.qty,
      price: item.price,
      subtotal: item.subtotal
    }));
    if (saleItems.length) await throwOnError(supabaseClient.from("sale_items").upsert(saleItems));
  }

  const credits = state.credits.map((credit) => ({
    id: credit.id,
    sale_id: credit.saleId,
    customer: credit.customer,
    phone: credit.phone,
    items_text: credit.itemsText,
    amount: credit.amount,
    credit_date: credit.date,
    notes: credit.notes,
    status: credit.status,
    paid_at: credit.paidAt,
    created_by: currentUser.id
  }));
  if (credits.length) await throwOnError(supabaseClient.from("credits").upsert(credits));

  const payments = state.payments.map((payment) => ({
    id: payment.id,
    credit_id: payment.creditId,
    amount: payment.amount,
    method: payment.method,
    paid_at: payment.date,
    created_by: currentUser.id
  }));
  if (payments.length) await throwOnError(supabaseClient.from("credit_payments").upsert(payments));
}

async function throwOnError(request) {
  const { error } = await request;
  if (error) throw error;
}

function todayKey() {
  return toDateInput(new Date());
}

function toDateInput(date) {
  const value = new Date(date);
  const offset = value.getTimezoneOffset();
  return new Date(value.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function formatDateTime(date) {
  return new Date(date).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function init() {
  $("#today-pill").textContent = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  $("#manual-credit-date").value = todayKey();
  $("#cut-date").value = todayKey();
  bindAuth();
  bindNavigation();
  bindInventory();
  bindSales();
  bindCredits();
  bindHistory();
  bindCut();
  startAuthFlow();
}

function bindAuth() {
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("#login-user").value.trim();
    const password = $("#login-password").value;
    if (!supabaseClient) return showToast("No se cargó Supabase. Revisa tu conexión a internet.");
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showToast(`No se pudo iniciar sesión: ${error.message}`);
    await setCurrentUserFromSession(data.session);
  });
  $("#logout-button").addEventListener("click", async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    cart = [];
    creditCart = [];
    showLogin();
  });
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app-shell").classList.add("hidden");
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app-shell").classList.remove("hidden");
  applyRoleUi();
  showView(isAdmin() ? "dashboard" : "ventas");
}

async function restoreSupabaseSession() {
  if (!supabaseClient) return showLogin();
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    await setCurrentUserFromSession(data.session);
  } else {
    showLogin();
  }
}

async function startAuthFlow() {
  if (REQUIRE_LOGIN_ON_OPEN) {
    if (supabaseClient) await supabaseClient.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    return showLogin();
  }
  await restoreSupabaseSession();
}

async function setCurrentUserFromSession(session) {
  if (!session?.user) return showLogin();
  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("full_name, role")
    .eq("id", session.user.id)
    .single();
  if (error || !profile) {
    showToast(`Este usuario no tiene perfil asignado: ${error?.message || "sin perfil"}`);
    return showLogin();
  }
  currentUser = {
    id: session.user.id,
    email: session.user.email,
    name: profile.full_name,
    role: profile.role
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
  $("#login-form").reset();
  await loadFromSupabase();
  showApp();
}

function isAdmin() {
  return currentUser?.role === "admin";
}

function canAccessView(viewId) {
  return isAdmin() || SELLER_VIEWS.includes(viewId);
}

function requireAdmin() {
  if (isAdmin()) return true;
  showToast("Solo el administrador puede hacer ese cambio.");
  return false;
}

function applyRoleUi() {
  $("#current-user-label").textContent = `${currentUser.name} (${isAdmin() ? "Administrador" : "Vendedor"})`;
  $$("[data-admin-only='true']").forEach((element) => element.classList.toggle("hidden", !isAdmin()));
  document.body.classList.toggle("seller-mode", !isAdmin());
  renderAll();
}

function bindNavigation() {
  $$("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });
}

function showView(viewId) {
  if (!canAccessView(viewId)) {
    showToast("Tu usuario no tiene acceso a ese módulo.");
    viewId = "ventas";
  }
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  $$(".nav-link").forEach((link) => link.classList.toggle("active", link.dataset.view === viewId));
  renderAll();
}

function bindInventory() {
  $("#product-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    const product = {
      id: $("#product-id").value || uid(),
      code: $("#product-code").value.trim(),
      name: $("#product-name").value.trim(),
      category: $("#product-category").value.trim(),
      price: Number($("#product-price").value),
      stock: Number($("#product-stock").value),
      unit: $("#product-unit").value
    };

    if ($("#product-id").value) {
      state.products = state.products.map((item) => (item.id === product.id ? product : item));
      showToast("Producto actualizado.");
    } else {
      state.products.push(product);
      showToast("Producto registrado.");
    }

    saveData();
    clearProductForm();
    renderAll();
  });

  $("#clear-product-form").addEventListener("click", clearProductForm);
  $("#inventory-search").addEventListener("input", renderInventory);
}

function clearProductForm() {
  $("#product-form").reset();
  $("#product-id").value = "";
}

function bindSales() {
  $("#sale-product-search").addEventListener("input", fillSalePrice);
  $("#sale-item-form").addEventListener("submit", addCartItem);
  $("#payment-method").addEventListener("change", () => {
    $("#credit-fields").classList.toggle("hidden", $("#payment-method").value !== "Fiado");
  });
  $("#finish-sale").addEventListener("click", finishSale);
  $("#print-ticket").addEventListener("click", () => printText(currentTicket));
  $("#download-ticket").addEventListener("click", () => downloadTicket(currentTicket));
}

function getProductFromSearch() {
  return getProductFromValue($("#sale-product-search").value);
}

function getProductFromValue(inputValue) {
  const value = inputValue.trim().toLowerCase();
  return state.products.find((product) => `${product.code} - ${product.name}`.toLowerCase() === value || product.name.toLowerCase() === value || product.code.toLowerCase() === value);
}

function fillSalePrice() {
  const product = getProductFromSearch();
  $("#sale-price").value = product ? product.price : "";
}

function addCartItem(event) {
  event.preventDefault();
  const product = getProductFromSearch();
  const qty = Number($("#sale-qty").value);
  if (!product) return showToast("Selecciona un producto del inventario.");
  if (qty <= 0) return showToast("La cantidad debe ser mayor a cero.");
  if (qty > product.stock) return showToast(`No hay suficiente existencia. Disponible: ${number(product.stock)} ${product.unit}.`);

  const existing = cart.find((item) => item.productId === product.id);
  const newQty = (existing?.qty || 0) + qty;
  if (newQty > product.stock) return showToast(`No puedes agregar más de ${number(product.stock)} ${product.unit}.`);

  if (existing) {
    existing.qty = newQty;
    existing.subtotal = existing.qty * existing.price;
  } else {
    cart.push({ productId: product.id, name: product.name, qty, price: product.price, unit: product.unit, subtotal: qty * product.price });
  }

  $("#sale-item-form").reset();
  renderCart();
}

function finishSale() {
  if (!cart.length) return showToast("Agrega al menos un producto a la venta.");
  const paymentMethod = $("#payment-method").value;
  const isCredit = paymentMethod === "Fiado";
  const customer = isCredit ? $("#credit-customer").value.trim() : "Mostrador";
  if (isCredit && !customer) return showToast("Escribe el nombre de la persona para el fiado.");

  for (const item of cart) {
    const product = state.products.find((entry) => entry.id === item.productId);
    if (!product || item.qty > product.stock) return showToast(`No hay suficiente existencia de ${item.name}.`);
  }

  const now = new Date();
  const total = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const sale = {
    id: uid(),
    ticket: `T-${Date.now().toString().slice(-6)}`,
    date: now.toISOString(),
    customer,
    paymentMethod,
    status: isCredit ? "fiado" : "pagado",
    paidAt: isCredit ? null : now.toISOString(),
    items: cart.map((item) => ({ ...item, id: item.id || uid() })),
    total
  };

  cart.forEach((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    product.stock = Number((product.stock - item.qty).toFixed(2));
  });

  state.sales.push(sale);
  if (isCredit) {
    state.credits.push({
      id: uid(),
      saleId: sale.id,
      customer,
      phone: $("#credit-phone").value.trim(),
      itemsText: cart.map((item) => `${number(item.qty)} ${item.unit} ${item.name}`).join(", "),
      amount: total,
      date: toDateInput(now),
      notes: $("#credit-notes").value.trim(),
      status: "pendiente",
      paidAt: null
    });
  }

  currentTicket = buildTicket(sale);
  currentSale = sale;
  $("#note-output").innerHTML = buildNoteHtml(sale);
  $("#ticket-output").textContent = currentTicket;
  $("#ticket-panel").classList.remove("hidden");
  cart = [];
  $("#credit-customer").value = "";
  $("#credit-phone").value = "";
  $("#credit-notes").value = "";
  saveData();
  renderAll();
  showToast("Venta finalizada y ticket generado.");
}

function bindCredits() {
  $("#manual-credit-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = $("#manual-credit-id").value || uid();
    const existingCredit = state.credits.find((item) => item.id === id);
    const total = creditCart.reduce((sum, item) => sum + item.subtotal, 0);
    if (existingCredit && creditCart.length) return showToast("Para cambiar materiales, elimina el fiado y crea uno nuevo.");
    if (!existingCredit && !creditCart.length) return showToast("Agrega al menos un material al fiado.");
    if (!existingCredit && total <= 0) return showToast("El monto del fiado debe ser mayor a cero.");

    for (const item of creditCart) {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (!product || item.qty > product.stock) return showToast(`No hay suficiente existencia de ${item.name}.`);
    }

    const customer = $("#manual-credit-name").value.trim();
    const dateValue = $("#manual-credit-date").value;
    const notes = $("#manual-credit-notes").value.trim();
    let saleId = existingCredit?.saleId || null;

    if (!existingCredit && creditCart.length) {
      const saleDate = new Date(`${dateValue}T12:00:00`);
      const sale = {
        id: uid(),
        ticket: `T-${Date.now().toString().slice(-6)}`,
        date: saleDate.toISOString(),
        customer,
        paymentMethod: "Fiado",
        status: "fiado",
        paidAt: null,
        items: creditCart.map((item) => ({ ...item, id: item.id || uid() })),
        total
      };

      creditCart.forEach((item) => {
        const product = state.products.find((entry) => entry.id === item.productId);
        product.stock = Number((product.stock - item.qty).toFixed(2));
      });

      state.sales.push(sale);
      saleId = sale.id;
      currentSale = sale;
      currentTicket = buildTicket(sale);
      $("#note-output").innerHTML = buildNoteHtml(sale);
      $("#ticket-output").textContent = currentTicket;
      $("#ticket-panel").classList.remove("hidden");
    }

    const credit = {
      id,
      saleId,
      customer,
      phone: $("#manual-credit-phone").value.trim(),
      itemsText: creditCart.length ? creditCart.map((item) => `${number(item.qty)} ${item.unit} ${item.name}`).join(", ") : existingCredit.itemsText,
      amount: creditCart.length ? total : existingCredit.amount,
      date: dateValue,
      notes,
      status: existingCredit?.status || "pendiente",
      paidAt: existingCredit?.paidAt || null
    };
    state.credits = state.credits.some((item) => item.id === id)
      ? state.credits.map((item) => (item.id === id ? credit : item))
      : [...state.credits, credit];
    saveData();
    clearCreditForm();
    renderAll();
    showToast("Fiado guardado y nota generada.");
  });

  $("#clear-credit-form").addEventListener("click", clearCreditForm);
  $("#credit-search").addEventListener("input", renderCredits);
  $("#credit-product-search").addEventListener("input", fillCreditPrice);
  $("#add-credit-item").addEventListener("click", addCreditCartItem);
  ["#credit-product-search", "#credit-qty"].forEach((selector) => {
    $(selector).addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        addCreditCartItem();
      }
    });
  });
}

function clearCreditForm() {
  $("#manual-credit-form").reset();
  $("#manual-credit-id").value = "";
  $("#manual-credit-date").value = todayKey();
  creditCart = [];
  renderCreditCart();
}

function fillCreditPrice() {
  const product = getProductFromValue($("#credit-product-search").value);
  $("#credit-price").value = product ? product.price : "";
}

function addCreditCartItem() {
  const product = getProductFromValue($("#credit-product-search").value);
  const qty = Number($("#credit-qty").value);
  if (!product) return showToast("Selecciona un producto del inventario.");
  if (qty <= 0) return showToast("La cantidad debe ser mayor a cero.");
  if (qty > product.stock) return showToast(`No hay suficiente existencia. Disponible: ${number(product.stock)} ${product.unit}.`);

  const existing = creditCart.find((item) => item.productId === product.id);
  const newQty = (existing?.qty || 0) + qty;
  if (newQty > product.stock) return showToast(`No puedes agregar más de ${number(product.stock)} ${product.unit}.`);

  if (existing) {
    existing.qty = newQty;
    existing.subtotal = existing.qty * existing.price;
  } else {
    creditCart.push({ productId: product.id, name: product.name, qty, price: product.price, unit: product.unit, subtotal: qty * product.price });
  }

  $("#credit-product-search").value = "";
  $("#credit-price").value = "";
  $("#credit-qty").value = "1";
  renderCreditCart();
}

function renderCreditCart() {
  const total = creditCart.reduce((sum, item) => sum + item.subtotal, 0);
  $("#manual-credit-amount").value = total ? total.toFixed(2) : "";
  $("#manual-credit-items").value = creditCart.map((item) => `${number(item.qty)} ${item.unit} ${item.name}`).join(", ");
  $("#credit-cart").innerHTML = creditCart.length
    ? creditCart
        .map((item, index) => `
          <tr>
            <td data-label="Producto">${escapeHtml(item.name)}</td>
            <td data-label="Cantidad">${number(item.qty)} ${escapeHtml(item.unit)}</td>
            <td data-label="Precio">${money(item.price)}</td>
            <td data-label="Subtotal">${money(item.subtotal)}</td>
            <td data-label="Acciones"><button class="mini-button danger" data-remove-credit-cart="${index}">Quitar</button></td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="5">Agrega materiales para formar la nota de fiado.</td></tr>`;
  $$("[data-remove-credit-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      creditCart.splice(Number(button.dataset.removeCreditCart), 1);
      renderCreditCart();
    });
  });
}

function bindHistory() {
  $("#history-search").addEventListener("input", renderHistory);
  $("#close-dialog").addEventListener("click", () => $("#detail-dialog").close());
  $("#dialog-print").addEventListener("click", () => printText($("#dialog-ticket").textContent));
}

function bindCut() {
  $("#cut-date").addEventListener("change", renderCut);
}

function renderAll() {
  renderProductOptions();
  renderDashboard();
  renderInventory();
  renderCart();
  renderCreditCart();
  renderCredits();
  renderHistory();
  renderCut();
  renderReports();
}

function renderProductOptions() {
  $("#product-options").innerHTML = state.products
    .map((product) => `<option value="${escapeHtml(product.code)} - ${escapeHtml(product.name)}">${money(product.price)} | ${number(product.stock)} ${product.unit}</option>`)
    .join("");
}

function renderDashboard() {
  const todaysPaid = paidSalesByDate(todayKey());
  const pendingCredits = state.credits.filter((credit) => credit.status === "pendiente");
  $("#dash-cash").textContent = money(todaysPaid.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0));
  $("#dash-sales").textContent = todaysPaid.length;
  $("#dash-credit").textContent = money(pendingCredits.reduce((sum, credit) => sum + credit.amount, 0));
  $("#dash-low-stock").textContent = state.products.filter((product) => product.stock <= LOW_STOCK_LIMIT).length;
  renderTopProducts("#top-products");
}

function renderInventory() {
  const query = $("#inventory-search").value?.toLowerCase() || "";
  const rows = state.products
    .filter((product) => [product.code, product.name, product.category].some((value) => value.toLowerCase().includes(query)))
    .map((product) => `
          <tr>
            <td data-label="Código">${escapeHtml(product.code)}</td>
            <td data-label="Material">${escapeHtml(product.name)}</td>
            <td data-label="Categoría">${escapeHtml(product.category)}</td>
            <td data-label="Precio">${money(product.price)}</td>
            <td data-label="Existencia" class="${product.stock <= LOW_STOCK_LIMIT ? "stock-low" : ""}">${number(product.stock)}${product.stock <= LOW_STOCK_LIMIT ? " - poca existencia" : ""}</td>
            <td data-label="Unidad">${escapeHtml(product.unit)}</td>
            <td data-label="Acciones">
          ${isAdmin() ? `
          <div class="row-actions">
            <button class="mini-button" data-edit-product="${product.id}">Editar</button>
            <button class="mini-button danger" data-delete-product="${product.id}">Eliminar</button>
          </div>
          ` : "Sin permiso"}
        </td>
      </tr>
    `)
    .join("");
  $("#inventory-table").innerHTML = rows || `<tr class="empty-row"><td colspan="7">No hay productos que coincidan.</td></tr>`;

  $$("[data-edit-product]").forEach((button) => button.addEventListener("click", () => editProduct(button.dataset.editProduct)));
  $$("[data-delete-product]").forEach((button) => button.addEventListener("click", () => deleteProduct(button.dataset.deleteProduct)));
}

function editProduct(id) {
  if (!requireAdmin()) return;
  const product = state.products.find((item) => item.id === id);
  if (!product) return;
  $("#product-id").value = product.id;
  $("#product-code").value = product.code;
  $("#product-name").value = product.name;
  $("#product-category").value = product.category;
  $("#product-price").value = product.price;
  $("#product-stock").value = product.stock;
  $("#product-unit").value = product.unit;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProduct(id) {
  if (!requireAdmin()) return;
  if (!confirm("¿Eliminar este producto del inventario?")) return;
  if (supabaseClient && currentUser) await supabaseClient.from("products").delete().eq("id", id);
  state.products = state.products.filter((product) => product.id !== id);
  saveData();
  renderAll();
  showToast("Producto eliminado.");
}

function renderCart() {
  $("#sale-cart").innerHTML = cart.length
    ? cart
        .map((item, index) => `
          <tr>
            <td data-label="Producto">${escapeHtml(item.name)}</td>
            <td data-label="Cantidad">${number(item.qty)} ${escapeHtml(item.unit)}</td>
            <td data-label="Precio">${money(item.price)}</td>
            <td data-label="Subtotal">${money(item.subtotal)}</td>
            <td data-label="Acciones"><button class="mini-button danger" data-remove-cart="${index}">Quitar</button></td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="5">Aún no hay productos agregados.</td></tr>`;
  $("#sale-total").textContent = money(cart.reduce((sum, item) => sum + item.subtotal, 0));
  $$("[data-remove-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      cart.splice(Number(button.dataset.removeCart), 1);
      renderCart();
    });
  });
}

function renderCredits() {
  const query = $("#credit-search").value?.toLowerCase() || "";
  const credits = state.credits.filter((credit) =>
    [credit.customer, credit.itemsText, credit.status, credit.phone].some((value) => String(value || "").toLowerCase().includes(query))
  );
  const pending = state.credits.filter((credit) => credit.status === "pendiente");
  $("#credit-total").textContent = money(pending.reduce((sum, credit) => sum + credit.amount, 0));
  $("#credit-people").textContent = new Set(pending.map((credit) => credit.customer)).size;
  $("#credit-table").innerHTML = credits.length
    ? credits
        .map((credit) => `
          <tr>
            <td data-label="Cliente"><strong>${escapeHtml(credit.customer)}</strong><br><span>${escapeHtml(credit.phone || "Sin teléfono")}</span></td>
            <td data-label="Materiales">${escapeHtml(credit.itemsText)}${credit.notes ? `<br><span>${escapeHtml(credit.notes)}</span>` : ""}</td>
            <td data-label="Monto">${money(credit.amount)}</td>
            <td data-label="Fecha">${escapeHtml(credit.date)}${credit.paidAt ? `<br><span>Pagado: ${escapeHtml(toDateInput(credit.paidAt))}</span>` : ""}</td>
            <td data-label="Estado">${credit.status === "pendiente" ? "Pendiente" : "Pagado"}</td>
            <td data-label="Acciones">
              <div class="row-actions">
                ${credit.status === "pendiente" ? `<button class="mini-button" data-pay-credit="${credit.id}">Marcar pagado</button>` : ""}
                ${isAdmin() ? `
                <button class="mini-button" data-edit-credit="${credit.id}">Editar</button>
                <button class="mini-button danger" data-delete-credit="${credit.id}">Eliminar</button>
                ` : ""}
              </div>
            </td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="6">No hay registros de fiado.</td></tr>`;

  $$("[data-pay-credit]").forEach((button) => button.addEventListener("click", () => payCredit(button.dataset.payCredit)));
  $$("[data-edit-credit]").forEach((button) => button.addEventListener("click", () => editCredit(button.dataset.editCredit)));
  $$("[data-delete-credit]").forEach((button) => button.addEventListener("click", () => deleteCredit(button.dataset.deleteCredit)));
}

function payCredit(id) {
  const now = new Date().toISOString();
  const credit = state.credits.find((item) => item.id === id);
  if (!credit) return;
  credit.status = "pagado";
  credit.paidAt = now;
  if (credit.saleId) {
    const sale = state.sales.find((item) => item.id === credit.saleId);
    if (sale) {
      sale.status = "pagado";
      sale.paidAt = now;
      sale.paymentMethod = "Pago de fiado";
    }
  } else {
    state.payments.push({ id: uid(), creditId: id, date: now, amount: credit.amount, method: "Pago de fiado" });
  }
  saveData();
  renderAll();
  showToast("Fiado marcado como pagado. Ya entra al corte de hoy.");
}

function editCredit(id) {
  if (!requireAdmin()) return;
  const credit = state.credits.find((item) => item.id === id);
  if (!credit) return;
  creditCart = [];
  renderCreditCart();
  $("#manual-credit-id").value = credit.id;
  $("#manual-credit-name").value = credit.customer;
  $("#manual-credit-phone").value = credit.phone || "";
  $("#manual-credit-items").value = credit.itemsText;
  $("#manual-credit-amount").value = credit.amount;
  $("#manual-credit-date").value = credit.date;
  $("#manual-credit-notes").value = credit.notes || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteCredit(id) {
  if (!requireAdmin()) return;
  if (!confirm("¿Eliminar este registro de fiado?")) return;
  const credit = state.credits.find((item) => item.id === id);
  if (credit?.saleId) {
    const sale = state.sales.find((item) => item.id === credit.saleId);
    sale?.items.forEach((item) => {
      const product = state.products.find((entry) => entry.id === item.productId);
      if (product) product.stock = Number((product.stock + item.qty).toFixed(2));
    });
    if (supabaseClient && currentUser) await supabaseClient.from("sales").delete().eq("id", credit.saleId);
    state.sales = state.sales.filter((saleItem) => saleItem.id !== credit.saleId);
  }
  if (supabaseClient && currentUser) await supabaseClient.from("credits").delete().eq("id", id);
  state.credits = state.credits.filter((credit) => credit.id !== id);
  state.payments = state.payments.filter((payment) => payment.creditId !== id);
  saveData();
  renderAll();
  showToast("Registro eliminado.");
}

function renderHistory() {
  const query = $("#history-search").value?.toLowerCase() || "";
  const sales = [...state.sales].reverse().filter((sale) => {
    const itemText = sale.items.map((item) => item.name).join(" ");
    return [sale.ticket, sale.customer, sale.paymentMethod, toDateInput(sale.date), itemText].some((value) => String(value).toLowerCase().includes(query));
  });
  $("#history-table").innerHTML = sales.length
    ? sales
        .map((sale) => `
          <tr>
            <td data-label="Ticket">${escapeHtml(sale.ticket)}</td>
            <td data-label="Fecha">${formatDateTime(sale.date)}</td>
            <td data-label="Cliente">${escapeHtml(sale.customer || "Mostrador")}</td>
            <td data-label="Pago">${escapeHtml(sale.paymentMethod)}${sale.status === "fiado" ? " (pendiente)" : ""}</td>
            <td data-label="Total">${money(sale.total)}</td>
            <td data-label="Acciones">
              <div class="row-actions">
                <button class="mini-button" data-ticket="${sale.id}">${isAdmin() ? "Ver / reimprimir" : "Ver nota"}</button>
                ${isAdmin() ? `
                <button class="mini-button danger" data-delete-sale="${sale.id}">Eliminar compra</button>
                ` : ""}
              </div>
            </td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="6">No hay ventas registradas.</td></tr>`;

  $$("[data-ticket]").forEach((button) => button.addEventListener("click", () => openTicket(button.dataset.ticket)));
  $$("[data-delete-sale]").forEach((button) => button.addEventListener("click", () => deleteSale(button.dataset.deleteSale)));
}

function renderCut() {
  const date = $("#cut-date").value || todayKey();
  const paid = paidSalesByDate(date);
  const payments = paymentsByDate(date);
  const total = paid.reduce((sum, sale) => sum + sale.total, 0) + payments.reduce((sum, payment) => sum + payment.amount, 0);
  const cash = paid.filter((sale) => sale.paymentMethod === "Efectivo").reduce((sum, sale) => sum + sale.total, 0);
  const other = total - cash;
  $("#cut-total").textContent = money(total);
  $("#cut-tickets").textContent = paid.length;
  $("#cut-cash").textContent = money(cash);
  $("#cut-other").textContent = money(other);

  const grouped = groupBy(paid, (sale) => sale.paymentMethod);
  payments.forEach((payment) => {
    grouped[payment.method] = grouped[payment.method] || [];
    grouped[payment.method].push({ total: payment.amount });
  });
  $("#cut-methods").innerHTML = Object.entries(grouped)
    .map(([method, sales]) => `<div class="method-item"><span>${escapeHtml(method)}</span><strong>${money(sales.reduce((sum, sale) => sum + sale.total, 0))}</strong></div>`)
    .join("") || `<p class="small-note">No hay movimientos pagados en esta fecha.</p>`;
}

function renderReports() {
  const today = new Date();
  const last7 = [...Array(7)].map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return toDateInput(date);
  });
  const paidSales = state.sales.filter((sale) => sale.status === "pagado");
  const weeklyTotal = paidSales.filter((sale) => last7.includes(toDateInput(sale.paidAt || sale.date))).reduce((sum, sale) => sum + sale.total, 0)
    + state.payments.filter((payment) => last7.includes(toDateInput(payment.date))).reduce((sum, payment) => sum + payment.amount, 0);
  const monthKey = todayKey().slice(0, 7);
  const monthlyTotal = paidSales.filter((sale) => toDateInput(sale.paidAt || sale.date).startsWith(monthKey)).reduce((sum, sale) => sum + sale.total, 0)
    + state.payments.filter((payment) => toDateInput(payment.date).startsWith(monthKey)).reduce((sum, payment) => sum + payment.amount, 0);
  const creditTotal = state.credits.filter((credit) => credit.status === "pendiente").reduce((sum, credit) => sum + credit.amount, 0);

  $("#report-week").textContent = money(weeklyTotal);
  $("#report-month").textContent = money(monthlyTotal);
  $("#report-credit").textContent = money(creditTotal);

  renderBarChart("#weekly-chart", last7.map((date) => ({
    label: date.slice(5),
    value: paidSalesByDate(date).reduce((sum, sale) => sum + sale.total, 0) + paymentsByDate(date).reduce((sum, payment) => sum + payment.amount, 0)
  })));

  const months = [...Array(6)].map((_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (5 - index), 1);
    const key = toDateInput(date).slice(0, 7);
    return {
      label: date.toLocaleDateString("es-MX", { month: "short" }),
      value: paidSales.filter((sale) => toDateInput(sale.paidAt || sale.date).startsWith(key)).reduce((sum, sale) => sum + sale.total, 0)
        + state.payments.filter((payment) => toDateInput(payment.date).startsWith(key)).reduce((sum, payment) => sum + payment.amount, 0)
    };
  });
  renderBarChart("#monthly-chart", months);
  renderCompareChart("#paid-credit-chart", monthlyTotal, creditTotal);
  renderTopProducts("#report-top-products");
}

function paidSalesByDate(dateKey) {
  return state.sales.filter((sale) => sale.status === "pagado" && toDateInput(sale.paidAt || sale.date) === dateKey);
}

function paymentsByDate(dateKey) {
  return state.payments.filter((payment) => toDateInput(payment.date) === dateKey);
}

function renderBarChart(selector, data) {
  const max = Math.max(...data.map((item) => item.value), 1);
  $(selector).innerHTML = data
    .map((item) => `
      <div class="bar">
        <div class="bar-value">${money(item.value).replace(".00", "")}</div>
        <div class="bar-fill" style="height:${Math.max(4, (item.value / max) * 150)}px"></div>
        <div class="bar-label">${escapeHtml(item.label)}</div>
      </div>
    `)
    .join("");
}

function renderCompareChart(selector, paid, credit) {
  const max = Math.max(paid, credit, 1);
  $(selector).innerHTML = `
    <div class="compare-row">
      <strong>Ingresos pagados: ${money(paid)}</strong>
      <div class="compare-track"><div class="compare-fill" style="width:${(paid / max) * 100}%"></div></div>
    </div>
    <div class="compare-row">
      <strong>Fiado pendiente: ${money(credit)}</strong>
      <div class="compare-track"><div class="compare-fill credit" style="width:${(credit / max) * 100}%"></div></div>
    </div>
  `;
}

function renderTopProducts(selector) {
  const totals = {};
  state.sales.forEach((sale) => {
    sale.items.forEach((item) => {
      totals[item.name] = (totals[item.name] || 0) + Number(item.qty);
    });
  });
  const ranked = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5);
  $(selector).innerHTML = ranked.length
    ? ranked.map(([name, qty], index) => `<div class="rank-item"><span>${index + 1}. ${escapeHtml(name)}</span><strong>${number(qty)}</strong></div>`).join("")
    : `<p class="small-note">Aún no hay ventas suficientes.</p>`;
}

function openTicket(id) {
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  currentSale = sale;
  $("#dialog-ticket").textContent = buildTicket(sale);
  $("#dialog-note").innerHTML = buildNoteHtml(sale);
  $("#dialog-print").classList.toggle("hidden", !isAdmin());
  $("#detail-dialog").showModal();
}

async function deleteSale(id) {
  if (!requireAdmin()) return;
  const sale = state.sales.find((item) => item.id === id);
  if (!sale) return;
  if (!confirm(`¿Eliminar la compra ${sale.ticket}? Se regresarán los productos al inventario.`)) return;

  sale.items.forEach((item) => {
    const product = state.products.find((entry) => entry.id === item.productId);
    if (product) product.stock = Number((product.stock + item.qty).toFixed(2));
  });

  const relatedCredits = state.credits.filter((credit) => credit.saleId === id);
  const relatedCreditIds = relatedCredits.map((credit) => credit.id);
  if (supabaseClient && currentUser) await supabaseClient.from("sales").delete().eq("id", id);
  state.credits = state.credits.filter((credit) => credit.saleId !== id);
  state.payments = state.payments.filter((payment) => !relatedCreditIds.includes(payment.creditId));
  state.sales = state.sales.filter((item) => item.id !== id);
  saveData();
  renderAll();
  showToast("Compra eliminada e inventario restaurado.");
}

function buildTicket(sale) {
  const lines = [
    "CASA DE MATERIALES EL CHINO",
    "Ticket: " + sale.ticket,
    "Fecha: " + formatDateTime(sale.date),
    "Cliente: " + (sale.customer || "Mostrador"),
    "Pago: " + sale.paymentMethod + (sale.status === "fiado" ? " (pendiente)" : ""),
    "----------------------------------------",
    "PRODUCTOS"
  ];
  sale.items.forEach((item) => {
    lines.push(`${item.name}`);
    lines.push(`  ${number(item.qty)} ${item.unit} x ${money(item.price)} = ${money(item.subtotal)}`);
  });
  lines.push("----------------------------------------");
  lines.push("TOTAL: " + money(sale.total));
  lines.push("Gracias por su compra.");
  return lines.join("\n");
}

function buildNoteHtml(sale) {
  const logoUrl = "assets/logo-el-chino.png";
  const rows = sale.items
    .map((item) => `
      <tr>
        <td>${number(item.qty)} ${escapeHtml(item.unit)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${money(item.subtotal)}</td>
      </tr>
    `)
    .join("");
  const emptyRows = Array.from({ length: Math.max(0, 7 - sale.items.length) }, () => `
    <tr>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
      <td>&nbsp;</td>
    </tr>
  `).join("");
  const isCredit = sale.status === "fiado";
  const paidLabel = isCredit ? "FIADO" : "PAGADO";

  return `
    <div class="note-head">
      <div class="note-meta">
        <div>FOLIO: <strong>${escapeHtml(sale.ticket.replace("T-", ""))}</strong></div>
      </div>
      <img class="note-logo" src="${logoUrl}" alt="Logo Casa de Materiales El Chino" />
      <div class="note-meta right">
        <img class="note-mini-logo" src="${logoUrl}" alt="Logo Casa de Materiales El Chino" />
        <div>FECHA: <span class="note-line">${escapeHtml(formatShortDate(sale.date))}</span></div>
      </div>
    </div>
    <div class="note-customer">CLIENTE: <span class="note-line">${escapeHtml(sale.customer || "Mostrador")}</span></div>
    <table class="note-table">
      <thead>
        <tr>
          <th>CANTIDAD</th>
          <th>DESCRIPCION</th>
          <th>TOTAL</th>
        </tr>
      </thead>
      <tbody>${rows}${emptyRows}</tbody>
    </table>
    <div class="note-bottom">
      <div class="note-stamp ${isCredit ? "credit" : ""}">${paidLabel}<br>EL CHINO</div>
      <div class="note-total"><span>TOTAL</span><strong>${money(sale.total)}</strong></div>
    </div>
    <div class="note-signatures">
      <span>FIRMA</span>
      <span>CLIENTE</span>
    </div>
  `;
}

function formatShortDate(date) {
  const value = new Date(date);
  const day = String(value.getDate()).padStart(2, "0");
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${day}/${months[value.getMonth()]}/${value.getFullYear()}`;
}

function printText(text) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  const logoUrl = new URL("assets/logo-el-chino.png", window.location.href).href;
  const noteHtml = currentSale ? buildNoteHtml(currentSale).replaceAll("assets/logo-el-chino.png", logoUrl) : "";
  const copiesHtml = currentSale
    ? ["COPIA NEGOCIO", "COPIA CLIENTE"]
        .map((label) => `
          <section class="receipt-copy">
            <div class="copy-label">${label}</div>
            ${noteHtml}
          </section>
        `)
        .join("")
    : `<pre class="ticket">${escapeHtml(text)}</pre>`;

  printWindow.document.write(`
    <html>
      <head>
        <title>Nota de venta</title>
        <style>
          @page {
            size: letter portrait;
            margin: 8mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            background: white;
            color: #0e2233;
            font-family: Arial, Helvetica, sans-serif;
          }

          .print-page {
            width: 100%;
            display: grid;
            gap: 6mm;
          }

          .receipt-copy {
            position: relative;
            min-height: 125mm;
            padding: 5mm 6mm;
            border: 1px dashed #9aa8b5;
            overflow: hidden;
            page-break-inside: avoid;
          }

          .copy-label {
            position: absolute;
            top: 4mm;
            right: 6mm;
            color: #657383;
            font-size: 9px;
            font-weight: 900;
            letter-spacing: 0;
          }

          .note-head {
            display: grid;
            grid-template-columns: 1fr 70px 1fr;
            align-items: start;
            gap: 8px;
          }

          .note-logo {
            width: 70px;
            height: 70px;
            object-fit: contain;
            justify-self: center;
          }

          .note-mini-logo {
            width: 44px;
            height: 44px;
            object-fit: contain;
            justify-self: end;
            margin-bottom: 4px;
          }

          .note-meta {
            display: grid;
            gap: 6px;
            padding-top: 24px;
            font-size: 14px;
            font-weight: 900;
          }

          .note-meta.right {
            justify-items: end;
            padding-top: 2px;
          }

          .note-meta strong {
            color: #b63a32;
            font-size: 15px;
          }

          .note-line {
            display: inline-block;
            min-width: 86px;
            padding: 0 4px 1px;
            border-bottom: 1.5px solid #334155;
            color: #0c5b92;
            font-family: "Comic Sans MS", "Segoe Print", cursive;
            font-size: 14px;
            font-weight: 700;
          }

          .note-customer {
            margin: 4px 0 6px;
            font-size: 14px;
            font-weight: 900;
          }

          .note-table {
            width: 100%;
            min-width: 0;
            border-collapse: collapse;
            border: 1.5px solid #17384e;
          }

          .note-table th {
            padding: 5px;
            color: white;
            background: #0c4f78;
            border: 1px solid #17384e;
            font-size: 11px;
            text-align: center;
          }

          .note-table td {
            height: 22px;
            padding: 4px 6px;
            border: 1px solid #8293a3;
            color: #0e2233;
            font-family: "Comic Sans MS", "Segoe Print", cursive;
            font-size: 13px;
          }

          .note-table td:first-child {
            width: 30%;
          }

          .note-table td:last-child {
            width: 24%;
            text-align: right;
            white-space: nowrap;
          }

          .note-bottom {
            display: grid;
            grid-template-columns: 1fr 145px;
            gap: 12px;
            align-items: end;
            margin-top: 7px;
          }

          .note-stamp {
            width: max-content;
            padding: 5px 14px;
            color: #b63a32;
            border: 2px solid #b63a32;
            transform: rotate(-2deg);
            font-size: 20px;
            font-weight: 900;
            text-align: center;
          }

          .note-stamp.credit {
            color: #0c5b92;
            border-color: #0c5b92;
          }

          .note-total {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border: 1.5px solid #17384e;
            font-weight: 900;
          }

          .note-total span,
          .note-total strong {
            padding: 5px;
            border-left: 1px solid #17384e;
          }

          .note-total span {
            background: #0c4f78;
            color: white;
          }

          .note-total strong {
            color: #0c5b92;
            font-family: "Comic Sans MS", "Segoe Print", cursive;
            text-align: right;
          }

          .note-signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 38px;
            margin-top: 17px;
            color: #475569;
            font-size: 10px;
            text-align: center;
          }

          .note-signatures span {
            display: block;
            padding-top: 5px;
            border-top: 1.5px solid #475569;
          }

          .ticket {
            white-space: pre-wrap;
            font-family: Consolas, "Courier New", monospace;
            font-size: 12px;
          }

          @media print {
            .receipt-copy {
              break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <main class="print-page">${copiesHtml}</main>
        <script>
          window.addEventListener("load", () => {
            setTimeout(() => {
              window.focus();
              window.print();
            }, 350);
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function downloadTicket(text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ticket-${Date.now()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function resetDemo() {
  if (!confirm("¿Restaurar los datos de ejemplo? Se reemplazará la información guardada en este navegador.")) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seedData));
  state = loadData();
  cart = [];
  renderAll();
  showToast("Datos de ejemplo restaurados.");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

init();


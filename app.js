const STORAGE_KEY = "blanqueria-mauri-state";

const demoState = {
  products: [
    { id: crypto.randomUUID(), name: "Juego de sabanas 2 plazas", category: "Sabanas", stock: 18, minStock: 6, price: 28500 },
    { id: crypto.randomUUID(), name: "Toallon premium", category: "Toallas", stock: 9, minStock: 8, price: 13200 },
    { id: crypto.randomUUID(), name: "Acolchado queen", category: "Acolchados", stock: 5, minStock: 3, price: 68200 },
    { id: crypto.randomUUID(), name: "Mantel antimanchas", category: "Manteleria", stock: 3, minStock: 5, price: 17100 }
  ],
  customers: [
    { id: crypto.randomUUID(), name: "Cliente mostrador", phone: "", address: "", notes: "" },
    { id: crypto.randomUUID(), name: "Hotel Plaza", phone: "11 4321-9988", address: "Av. San Martin 1200", notes: "Compra reposiciones para habitaciones." },
    { id: crypto.randomUUID(), name: "Maria Fernandez", phone: "11 5555-2200", address: "Belgrano 842", notes: "" }
  ],
  sales: []
};

let state = loadState();
let activeCustomerId = null;

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

const views = {
  dashboard: document.querySelector("#dashboard-view"),
  sales: document.querySelector("#sales-view"),
  customers: document.querySelector("#customers-view")
};

const titles = {
  dashboard: "Resumen",
  sales: "Ventas",
  customers: "Clientes"
};

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return normalizeState(structuredClone(demoState));

  try {
    return normalizeState(JSON.parse(stored));
  } catch {
    return normalizeState(structuredClone(demoState));
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function buildBackupPayload() {
  return {
    app: "blanqueria-mauri-gestion",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: normalizeState(state)
  };
}

function exportBackup() {
  const payload = buildBackupPayload();
  const content = JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");

  link.href = url;
  link.download = `blanqueria-mauri-respaldo-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseBackupPayload(rawContent) {
  const parsed = JSON.parse(rawContent);
  const candidate = parsed?.data ?? parsed;

  if (!Array.isArray(candidate?.products) || !Array.isArray(candidate?.customers) || !Array.isArray(candidate?.sales)) {
    throw new Error("El archivo no tiene la estructura esperada.");
  }

  return normalizeState(candidate);
}

function importBackupFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const importedState = parseBackupPayload(String(reader.result ?? ""));
      const confirmed = confirm("Importar este respaldo reemplazara todos los datos actuales. Continuar?");
      if (!confirmed) return;

      state = importedState;
      saveState();
      render();
      alert("Respaldo importado correctamente.");
    } catch (error) {
      alert(`No se pudo importar el respaldo. ${error.message}`);
    } finally {
      document.querySelector("#backup-file").value = "";
    }
  });

  reader.addEventListener("error", () => {
    alert("No se pudo leer el archivo de respaldo.");
    document.querySelector("#backup-file").value = "";
  });

  reader.readAsText(file);
}

function normalizeState(source) {
  const normalized = {
    products: Array.isArray(source.products) ? source.products : [],
    customers: Array.isArray(source.customers) ? source.customers : [],
    sales: Array.isArray(source.sales) ? source.sales : []
  };

  normalized.customers = normalized.customers.map((customer) => ({
    ...customer,
    id: customer.id || crypto.randomUUID(),
    name: customer.name || "Cliente sin nombre",
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? ""
  }));

  if (!normalized.customers.some((customer) => customer.name.toLowerCase() === "cliente mostrador")) {
    normalized.customers.unshift({ id: crypto.randomUUID(), name: "Cliente mostrador", phone: "", address: "", notes: "" });
  }

  normalized.sales = normalized.sales.map(normalizeSale);

  return normalized;
}

function normalizeSale(sale) {
  const saleId = sale.id || crypto.randomUUID();
  const date = normalizeDateInput(sale.date || sale.createdAt || new Date().toISOString());
  const customerId = sale.customerId || "";
  const customerName = sale.customerName || "Cliente mostrador";
  const items = normalizeSaleItems(sale);
  const total = getItemsTotal(items);
  const payments = normalizeSalePayments(sale, total);

  return {
    id: saleId,
    date,
    customerId,
    customerName,
    items,
    payments,
    total,
    createdAt: sale.createdAt || sale.date || new Date().toISOString()
  };
}

function normalizeSaleItems(sale) {
  if (Array.isArray(sale.items) && sale.items.length) {
    return sale.items.map((item) => {
      const quantity = Math.max(Number(item.quantity ?? 1), 0);
      const unitPrice = Math.max(Number(item.unitPrice ?? item.price ?? 0), 0);
      const subtotal = quantity * unitPrice;

      return {
        id: item.id || crypto.randomUUID(),
        description: item.description || item.productName || item.detail || "Producto",
        quantity,
        unitPrice,
        subtotal
      };
    });
  }

  const quantity = Math.max(Number(sale.quantity ?? 1), 1);
  const total = Math.max(Number(sale.total ?? 0), 0);
  const unitPrice = quantity > 0 ? total / quantity : total;

  return [
    {
      id: crypto.randomUUID(),
      description: sale.detail || sale.productName || "Compra",
      quantity,
      unitPrice,
      subtotal: total
    }
  ];
}

function normalizeSalePayments(sale, saleTotal) {
  if (Array.isArray(sale.payments)) {
    return sale.payments
      .map((payment) => ({
        id: payment.id || crypto.randomUUID(),
        date: normalizeDateInput(payment.date || sale.date || new Date().toISOString()),
        amount: Math.max(Number(payment.amount ?? 0), 0),
        note: payment.note ?? ""
      }))
      .filter((payment) => payment.amount > 0);
  }

  const paidAmount = Number.isFinite(Number(sale.paidAmount)) ? Number(sale.paidAmount) : Number(saleTotal);
  if (paidAmount <= 0) return [];

  return [
    {
      id: crypto.randomUUID(),
      date: normalizeDateInput(sale.date || new Date().toISOString()),
      amount: Math.min(Math.max(paidAmount, 0), saleTotal),
      note: "Pago inicial"
    }
  ];
}

function render() {
  renderMetrics();
  renderSales();
  renderCustomers();
  renderSaleSelectors();
  renderSaleItems();
  updateSaleTotalsPreview();
}

function renderMetrics() {
  const today = todayInputValue();
  const currentMonth = today.slice(0, 7);
  const salesToday = state.sales.filter((sale) => sale.date === today);
  const salesThisMonth = state.sales.filter((sale) => sale.date?.slice(0, 7) === currentMonth);
  const daySalesTotal = salesToday.reduce((total, sale) => total + getSaleTotal(sale), 0);
  const monthSalesTotal = salesThisMonth.reduce((total, sale) => total + getSaleTotal(sale), 0);
  const dayPaidTotal = state.sales.reduce((total, sale) => total + getPaymentsTotalByPeriod(sale, today, "day"), 0);
  const monthPaidTotal = state.sales.reduce((total, sale) => total + getPaymentsTotalByPeriod(sale, currentMonth, "month"), 0);
  const totalBalance = state.sales.reduce((total, sale) => total + getSaleBalance(sale), 0);
  const pendingSales = state.sales.filter((sale) => getSaleBalance(sale) > 0);
  const customersWithBalance = new Set(pendingSales.map((sale) => sale.customerId)).size;
  const recent = state.sales.slice(0, 6);

  document.querySelector("#metric-day-sales").textContent = money.format(daySalesTotal);
  document.querySelector("#metric-month-sales").textContent = money.format(monthSalesTotal);
  document.querySelector("#metric-day-paid").textContent = money.format(dayPaidTotal);
  document.querySelector("#metric-month-paid").textContent = money.format(monthPaidTotal);
  document.querySelector("#metric-total-balance").textContent = money.format(totalBalance);
  document.querySelector("#metric-customers-with-balance").textContent = customersWithBalance;
  document.querySelector("#metric-pending-sales").textContent = pendingSales.length;

  document.querySelector("#recent-movements").innerHTML = recent.length
    ? recent.map(movementTemplate).join("")
    : `<p class="empty">Todavia no hay ventas registradas.</p>`;
}

function renderSaleSelectors() {
  const customerSelect = document.querySelector("#sale-customer");
  customerSelect.innerHTML = state.customers
    .map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`)
    .join("");
}

function renderSaleItems() {
  const items = document.querySelectorAll(".sale-item-row");
  if (items.length) return;
  addSaleItemRow();
}

function renderSales() {
  document.querySelector("#sales-list").innerHTML = state.sales.length
    ? state.sales.map(saleTemplate).join("")
    : `<p class="empty">Registra una venta para verla en el historial.</p>`;
}

function renderCustomers() {
  document.querySelector("#customers-list").innerHTML = state.customers.map((customer) => `
    <article class="customer-card">
      <div>
        <strong>${escapeHtml(customer.name)}</strong>
        <p>${escapeHtml(customer.phone || "Sin telefono")}</p>
        <p>${escapeHtml(customer.address || "Sin direccion")}</p>
      </div>
      <div class="actions">
        <button class="small-button" type="button" data-view-customer="${customer.id}">Ver ficha</button>
        <button class="small-button" type="button" data-edit-customer="${customer.id}">Editar</button>
        <button class="small-button danger" type="button" data-delete-customer="${customer.id}">Eliminar</button>
      </div>
    </article>
  `).join("");
}

function saleTemplate(sale) {
  const total = getSaleTotal(sale);
  const paid = getSalePaidAmount(sale);
  const balance = getSaleBalance(sale);

  return `
    <article class="list-item sale-list-item">
      <div>
        <strong>${escapeHtml(sale.customerName)} - ${new Date(sale.date).toLocaleDateString("es-AR")}</strong>
        <span>${escapeHtml(getSaleSummary(sale))}</span>
        <span>Pagado: ${money.format(paid)} - Saldo: ${money.format(balance)}</span>
      </div>
      <div>
        <strong>${money.format(total)}</strong>
        ${statusBadge(balance, paid)}
      </div>
    </article>
  `;
}

function movementTemplate(sale) {
  const paid = getSalePaidAmount(sale);
  const balance = getSaleBalance(sale);

  return `
    <article class="list-item sale-list-item">
      <div>
        <strong>${new Date(sale.date).toLocaleDateString("es-AR")} - ${escapeHtml(sale.customerName)}</strong>
        <span>Total: ${money.format(getSaleTotal(sale))}</span>
        <span>Pagado: ${money.format(paid)} - Saldo: ${money.format(balance)}</span>
      </div>
      <div>
        ${statusBadge(balance, paid)}
      </div>
    </article>
  `;
}

function openCustomerDialog(customer = null) {
  document.querySelector("#customer-id").value = customer?.id ?? "";
  document.querySelector("#customer-name").value = customer?.name ?? "";
  document.querySelector("#customer-phone").value = customer?.phone ?? "";
  document.querySelector("#customer-address").value = customer?.address ?? "";
  document.querySelector("#customer-notes").value = customer?.notes ?? "";
  document.querySelector("#customer-dialog").showModal();
}

function openCustomerDetail(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) return;

  activeCustomerId = customer.id;
  const sales = getCustomerSales(customer.id);
  const totalBought = sales.reduce((total, sale) => total + getSaleTotal(sale), 0);
  const totalPaid = sales.reduce((total, sale) => total + getSalePaidAmount(sale), 0);
  const totalBalance = Math.max(totalBought - totalPaid, 0);
  const whatsapp = document.querySelector("#detail-whatsapp");

  document.querySelector("#detail-customer-name").textContent = customer.name;
  document.querySelector("#detail-customer-phone").textContent = customer.phone || "Sin telefono";
  document.querySelector("#detail-customer-address").textContent = customer.address || "Sin direccion";
  document.querySelector("#detail-customer-notes").textContent = customer.notes || "Sin observaciones.";
  document.querySelector("#detail-total-bought").textContent = money.format(totalBought);
  document.querySelector("#detail-total-paid").textContent = money.format(totalPaid);
  document.querySelector("#detail-total-balance").textContent = money.format(totalBalance);
  document.querySelector("#detail-sales-list").innerHTML = sales.map(customerSaleTemplate).join("");

  if (totalBalance > 0) {
    const message = `Hola ${customer.name}, te saludamos de Blanquería Mauri. Te recordamos que queda pendiente un saldo de ${money.format(totalBalance)}. Muchas gracias.`;
    const phone = customer.phone.replace(/\D/g, "");
    const phonePath = phone ? `/${phone}` : "/";
    whatsapp.href = `https://wa.me${phonePath}?text=${encodeURIComponent(message)}`;
    whatsapp.classList.add("visible");
  } else {
    whatsapp.removeAttribute("href");
    whatsapp.classList.remove("visible");
  }

  document.querySelector("#detail-empty-sales").style.display = sales.length ? "none" : "block";
  const dialog = document.querySelector("#customer-detail-dialog");
  if (!dialog.open) {
    dialog.showModal();
  }
}

function customerSaleTemplate(sale) {
  const total = getSaleTotal(sale);
  const paid = getSalePaidAmount(sale);
  const balance = getSaleBalance(sale);

  return `
    <article class="history-sale">
      <div class="history-sale-header">
        <div>
          <strong>${new Date(sale.date).toLocaleDateString("es-AR")}</strong>
          <span>${statusBadge(balance, paid)}</span>
        </div>
        <div class="history-sale-totals">
          <span>Total ${money.format(total)}</span>
          <span>Pagado ${money.format(paid)}</span>
          <span>Saldo ${money.format(balance)}</span>
        </div>
      </div>

      <div class="history-section">
        <h4>Items</h4>
        <div class="history-lines">
          ${sale.items.map((item) => `
            <div class="history-line">
              <span>${escapeHtml(item.description)} x ${item.quantity}</span>
              <span>${money.format(item.unitPrice)} c/u</span>
              <strong>${money.format(item.subtotal)}</strong>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="history-section">
        <h4>Pagos</h4>
        <div class="history-lines">
          ${sale.payments.length ? sale.payments.map((payment) => `
            <div class="history-line">
              <span>${new Date(payment.date).toLocaleDateString("es-AR")}</span>
              <span>${escapeHtml(payment.note || "Pago")}</span>
              <strong>${money.format(payment.amount)}</strong>
            </div>
          `).join("") : `<p class="empty compact-empty">Sin pagos registrados.</p>`}
        </div>
      </div>
    </article>
  `;
}

function openPaymentDialog(customerId) {
  const customer = state.customers.find((item) => item.id === customerId);
  if (!customer) return;

  const pendingSales = getCustomerSales(customer.id).filter((sale) => getSaleBalance(sale) > 0);
  if (!pendingSales.length) {
    alert("Este cliente no tiene ventas pendientes.");
    return;
  }

  document.querySelector("#payment-customer-id").value = customer.id;
  document.querySelector("#payment-sale").innerHTML = pendingSales.map((sale) => `
    <option value="${sale.id}">${new Date(sale.date).toLocaleDateString("es-AR")} - ${escapeHtml(getSaleSummary(sale))} - saldo ${money.format(getSaleBalance(sale))}</option>
  `).join("");
  document.querySelector("#payment-date").value = todayInputValue();
  document.querySelector("#payment-amount").value = "";
  document.querySelector("#payment-note").value = "";
  document.querySelector("#payment-dialog").showModal();
}

function addSaleItemRow(item = null) {
  const wrapper = document.querySelector("#sale-items");
  const row = document.createElement("div");
  row.className = "sale-item-row";
  row.innerHTML = `
    <label>
      Descripcion
      <input class="sale-item-description" value="${escapeHtml(item?.description ?? "")}" required />
    </label>
    <label>
      Cantidad
      <input class="sale-item-quantity" type="number" min="1" step="1" value="${item?.quantity ?? 1}" required />
    </label>
    <label>
      Precio unitario
      <input class="sale-item-price" type="number" min="0" step="100" value="${item?.unitPrice ?? 0}" required />
    </label>
    <div class="sale-item-subtotal">
      <span>Subtotal</span>
      <strong>$0</strong>
    </div>
    <button class="small-button danger" type="button" data-remove-sale-item>Eliminar</button>
  `;
  wrapper.appendChild(row);
  updateSaleTotalsPreview();
}

function collectSaleItemsFromForm() {
  return [...document.querySelectorAll(".sale-item-row")]
    .map((row) => {
      const description = row.querySelector(".sale-item-description").value.trim();
      const quantity = Number(row.querySelector(".sale-item-quantity").value);
      const unitPrice = Number(row.querySelector(".sale-item-price").value);

      return {
        id: crypto.randomUUID(),
        description,
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice
      };
    })
    .filter((item) => item.description && item.quantity > 0 && item.unitPrice >= 0);
}

function updateSaleTotalsPreview() {
  document.querySelectorAll(".sale-item-row").forEach((row) => {
    const quantity = Number(row.querySelector(".sale-item-quantity").value || 0);
    const unitPrice = Number(row.querySelector(".sale-item-price").value || 0);
    row.querySelector(".sale-item-subtotal strong").textContent = money.format(quantity * unitPrice);
  });

  const items = collectSaleItemsFromForm();
  const total = getItemsTotal(items);
  const paid = Math.max(Number(document.querySelector("#sale-initial-payment").value || 0), 0);
  const balance = Math.max(total - paid, 0);

  document.querySelector("#sale-total-preview").textContent = money.format(total);
  document.querySelector("#sale-paid-preview").textContent = money.format(Math.min(paid, total));
  document.querySelector("#sale-balance-preview").textContent = money.format(balance);
}

function resetSaleForm(customerId = null) {
  document.querySelector("#sale-date").value = todayInputValue();
  document.querySelector("#sale-initial-payment").value = 0;
  document.querySelector("#sale-items").innerHTML = "";
  addSaleItemRow();
  if (customerId) {
    document.querySelector("#sale-customer").value = customerId;
  }
  updateSaleTotalsPreview();
}

function showView(viewName) {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === viewName);
  });
  Object.values(views).forEach((view) => view.classList.remove("active"));
  views[viewName].classList.add("active");
  document.querySelector("#view-title").textContent = titles[viewName];
}

function getCustomerSales(customerId) {
  return state.sales.filter((sale) => sale.customerId === customerId);
}

function getItemsTotal(items) {
  return items.reduce((total, item) => total + Number(item.subtotal ?? item.quantity * item.unitPrice ?? 0), 0);
}

function getSaleTotal(sale) {
  return getItemsTotal(sale.items || []);
}

function getSalePaidAmount(sale) {
  return (sale.payments || []).reduce((total, payment) => total + Number(payment.amount ?? 0), 0);
}

function getPaymentsTotalByPeriod(sale, period, mode) {
  return (sale.payments || []).reduce((total, payment) => {
    const paymentDate = normalizeDateInput(payment.date);
    const matches = mode === "month" ? paymentDate.slice(0, 7) === period : paymentDate === period;
    return matches ? total + Number(payment.amount ?? 0) : total;
  }, 0);
}

function getSaleBalance(sale) {
  return Math.max(getSaleTotal(sale) - getSalePaidAmount(sale), 0);
}

function getSaleSummary(sale) {
  return (sale.items || []).map((item) => `${item.description} x ${item.quantity}`).join(", ");
}

function statusBadge(balance, paidAmount) {
  if (balance <= 0) return `<span class="badge success">Pagado</span>`;
  if (paidAmount > 0) return `<span class="badge warn">Con saldo</span>`;
  return `<span class="badge pending">Pendiente</span>`;
}

function normalizeDateInput(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayInputValue();
  return date.toISOString().slice(0, 10);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

document.querySelector("#add-customer").addEventListener("click", () => openCustomerDialog());
document.querySelector("#add-sale-item").addEventListener("click", () => addSaleItemRow());
document.querySelector("#sale-items").addEventListener("input", updateSaleTotalsPreview);
document.querySelector("#sale-initial-payment").addEventListener("input", updateSaleTotalsPreview);
document.querySelector("#export-backup").addEventListener("click", exportBackup);
document.querySelector("#import-backup").addEventListener("click", () => {
  document.querySelector("#backup-file").click();
});
document.querySelector("#backup-file").addEventListener("change", (event) => {
  importBackupFile(event.target.files?.[0]);
});
document.querySelector("#detail-new-sale").addEventListener("click", () => {
  const customerId = activeCustomerId;
  document.querySelector("#customer-detail-dialog").close();
  showView("sales");
  resetSaleForm(customerId);
});
document.querySelector("#detail-register-payment").addEventListener("click", () => {
  openPaymentDialog(activeCustomerId);
});

document.querySelector("#customer-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const customer = {
    id: document.querySelector("#customer-id").value || crypto.randomUUID(),
    name: document.querySelector("#customer-name").value.trim(),
    phone: document.querySelector("#customer-phone").value.trim(),
    address: document.querySelector("#customer-address").value.trim(),
    notes: document.querySelector("#customer-notes").value.trim()
  };

  const index = state.customers.findIndex((item) => item.id === customer.id);
  if (index >= 0) {
    state.customers[index] = customer;
  } else {
    state.customers.push(customer);
  }

  saveState();
  render();
  document.querySelector("#customer-dialog").close();
});

document.querySelector("#sale-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const customer = state.customers.find((item) => item.id === document.querySelector("#sale-customer").value);
  const items = collectSaleItemsFromForm();
  const total = getItemsTotal(items);
  const initialPayment = Number(document.querySelector("#sale-initial-payment").value);

  if (!customer) {
    alert("Selecciona un cliente para registrar la venta.");
    return;
  }

  if (!items.length || total <= 0) {
    alert("Agrega al menos un item con descripcion, cantidad y precio.");
    return;
  }

  if (initialPayment < 0 || initialPayment > total) {
    alert("La entrega inicial debe estar entre 0 y el total de la venta.");
    return;
  }

  const sale = {
    id: crypto.randomUUID(),
    date: document.querySelector("#sale-date").value,
    customerId: customer.id,
    customerName: customer.name,
    items,
    payments: initialPayment > 0
      ? [{ id: crypto.randomUUID(), date: document.querySelector("#sale-date").value, amount: initialPayment, note: "Entrega inicial" }]
      : [],
    total,
    createdAt: new Date().toISOString()
  };

  state.sales.unshift(sale);
  saveState();
  render();
  resetSaleForm(customer.id);
});

document.querySelector("#payment-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const sale = state.sales.find((item) => item.id === document.querySelector("#payment-sale").value);
  const amount = Number(document.querySelector("#payment-amount").value);
  const balance = sale ? getSaleBalance(sale) : 0;

  if (!sale) {
    alert("Selecciona una venta pendiente.");
    return;
  }

  if (amount <= 0 || amount > balance) {
    alert("El monto debe ser mayor a 0 y no puede superar el saldo de la venta seleccionada.");
    return;
  }

  sale.payments.push({
    id: crypto.randomUUID(),
    date: document.querySelector("#payment-date").value,
    amount,
    note: document.querySelector("#payment-note").value.trim()
  });

  saveState();
  render();
  document.querySelector("#payment-dialog").close();
  if (activeCustomerId) openCustomerDetail(activeCustomerId);
});

document.body.addEventListener("click", (event) => {
  const viewCustomerId = event.target.dataset.viewCustomer;
  const editCustomerId = event.target.dataset.editCustomer;
  const deleteCustomerId = event.target.dataset.deleteCustomer;

  if (event.target.matches("[data-remove-sale-item]")) {
    const rows = document.querySelectorAll(".sale-item-row");
    if (rows.length <= 1) {
      alert("La venta debe tener al menos un item.");
      return;
    }
    event.target.closest(".sale-item-row").remove();
    updateSaleTotalsPreview();
  }

  if (viewCustomerId) {
    openCustomerDetail(viewCustomerId);
  }

  if (editCustomerId) {
    openCustomerDialog(state.customers.find((customer) => customer.id === editCustomerId));
  }

  if (deleteCustomerId && confirm("Eliminar este cliente?")) {
    state.customers = state.customers.filter((customer) => customer.id !== deleteCustomerId);
    saveState();
    render();
  }

  if (event.target.matches("[data-close-dialog]")) {
    event.target.closest("dialog").close();
  }
});

document.querySelector("#reset-demo").addEventListener("click", () => {
  if (!confirm("Restaurar datos demo? Se reemplazaran los cambios guardados en este navegador.")) return;
  state = normalizeState(structuredClone(demoState));
  saveState();
  render();
});

document.querySelector("#sale-date").value = todayInputValue();
document.querySelector("#payment-date").value = todayInputValue();
render();

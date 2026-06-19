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

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

const views = {
  dashboard: document.querySelector("#dashboard-view"),
  inventory: document.querySelector("#inventory-view"),
  sales: document.querySelector("#sales-view"),
  customers: document.querySelector("#customers-view")
};

const titles = {
  dashboard: "Resumen",
  inventory: "Inventario",
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
    version: 1,
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
      const confirmed = confirm("Importar este respaldo reemplazara todos los datos actuales. ¿Continuar?");
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
    phone: customer.phone ?? "",
    address: customer.address ?? "",
    notes: customer.notes ?? ""
  }));

  normalized.sales = normalized.sales.map((sale) => ({
    ...sale,
    detail: sale.detail ?? `${sale.productName ?? "Compra"} x ${sale.quantity ?? 1}`,
    paidAmount: Number.isFinite(Number(sale.paidAmount)) ? Number(sale.paidAmount) : Number(sale.total ?? 0)
  }));

  return normalized;
}

function render() {
  renderMetrics();
  renderInventory();
  renderSales();
  renderCustomers();
  renderSaleSelectors();
}

function renderMetrics() {
  const stockValue = state.products.reduce((total, product) => total + product.stock * product.price, 0);
  const monthSales = state.sales.reduce((total, sale) => total + sale.total, 0);
  const lowStock = state.products.filter((product) => product.stock <= product.minStock);

  document.querySelector("#metric-stock").textContent = money.format(stockValue);
  document.querySelector("#metric-sales").textContent = money.format(monthSales);
  document.querySelector("#metric-low-stock").textContent = lowStock.length;
  document.querySelector("#metric-customers").textContent = state.customers.length;

  const alerts = document.querySelector("#stock-alerts");
  alerts.innerHTML = lowStock.length
    ? lowStock.map((product) => `
        <article class="list-item">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <span>${escapeHtml(product.category)} - quedan ${product.stock}</span>
          </div>
          <span class="badge warn">Min. ${product.minStock}</span>
        </article>
      `).join("")
    : `<p class="empty">No hay productos por debajo del minimo.</p>`;

  const recent = state.sales.slice(0, 5);
  document.querySelector("#recent-sales").innerHTML = recent.length
    ? recent.map(saleTemplate).join("")
    : `<p class="empty">Todavia no hay ventas registradas.</p>`;
}

function renderInventory() {
  document.querySelector("#inventory-table").innerHTML = state.products.map((product) => `
    <tr>
      <td><strong>${escapeHtml(product.name)}</strong></td>
      <td>${escapeHtml(product.category)}</td>
      <td>${product.stock} ${product.stock <= product.minStock ? `<span class="badge warn">Bajo</span>` : ""}</td>
      <td>${product.minStock}</td>
      <td>${money.format(product.price)}</td>
      <td>
        <div class="actions">
          <button class="small-button" type="button" data-edit-product="${product.id}">Editar</button>
          <button class="small-button danger" type="button" data-delete-product="${product.id}">Eliminar</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderSaleSelectors() {
  const productSelect = document.querySelector("#sale-product");
  const customerSelect = document.querySelector("#sale-customer");

  productSelect.innerHTML = state.products
    .filter((product) => product.stock > 0)
    .map((product) => `<option value="${product.id}">${escapeHtml(product.name)} - ${money.format(product.price)}</option>`)
    .join("");

  customerSelect.innerHTML = state.customers
    .map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`)
    .join("");
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
  const balance = getSaleBalance(sale);

  return `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(sale.detail ?? `${sale.productName} x ${sale.quantity}`)}</strong>
        <span>${escapeHtml(sale.customerName)} - ${new Date(sale.date).toLocaleDateString("es-AR")}</span>
        <span>Pagado: ${money.format(getSalePaidAmount(sale))} - Saldo: ${money.format(balance)}</span>
      </div>
      <div>
        <strong>${money.format(sale.total)}</strong>
        ${statusBadge(balance, getSalePaidAmount(sale))}
      </div>
    </article>
  `;
}

function openProductDialog(product = null) {
  document.querySelector("#product-dialog-title").textContent = product ? "Editar producto" : "Agregar producto";
  document.querySelector("#product-id").value = product?.id ?? "";
  document.querySelector("#product-name").value = product?.name ?? "";
  document.querySelector("#product-category").value = product?.category ?? "";
  document.querySelector("#product-stock").value = product?.stock ?? 0;
  document.querySelector("#product-min-stock").value = product?.minStock ?? 0;
  document.querySelector("#product-price").value = product?.price ?? 0;
  document.querySelector("#product-dialog").showModal();
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

  const sales = state.sales.filter((sale) => sale.customerId === customer.id);
  const totalBought = sales.reduce((total, sale) => total + Number(sale.total ?? 0), 0);
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

  document.querySelector("#detail-sales-table").innerHTML = sales.map((sale) => {
    const paid = getSalePaidAmount(sale);
    const balance = getSaleBalance(sale);

    return `
      <tr>
        <td>${new Date(sale.date).toLocaleDateString("es-AR")}</td>
        <td>${escapeHtml(sale.detail ?? `${sale.productName} x ${sale.quantity}`)}</td>
        <td>${money.format(Number(sale.total ?? 0))}</td>
        <td>${money.format(paid)}</td>
        <td>${money.format(balance)}</td>
        <td>${statusBadge(balance, paid)}</td>
      </tr>
    `;
  }).join("");

  document.querySelector("#detail-empty-sales").style.display = sales.length ? "none" : "block";
  document.querySelector("#customer-detail-dialog").showModal();
}

function getSalePaidAmount(sale) {
  return Math.max(Number(sale.paidAmount ?? sale.total ?? 0), 0);
}

function getSaleBalance(sale) {
  return Math.max(Number(sale.total ?? 0) - getSalePaidAmount(sale), 0);
}

function statusBadge(balance, paidAmount) {
  if (balance <= 0) return `<span class="badge success">Pagado</span>`;
  if (paidAmount > 0) return `<span class="badge warn">Con saldo</span>`;
  return `<span class="badge pending">Pendiente</span>`;
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
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    Object.values(views).forEach((view) => view.classList.remove("active"));
    views[button.dataset.view].classList.add("active");
    document.querySelector("#view-title").textContent = titles[button.dataset.view];
  });
});

document.querySelector("#add-product").addEventListener("click", () => openProductDialog());
document.querySelector("#add-customer").addEventListener("click", () => openCustomerDialog());
document.querySelector("#export-backup").addEventListener("click", exportBackup);
document.querySelector("#import-backup").addEventListener("click", () => {
  document.querySelector("#backup-file").click();
});
document.querySelector("#backup-file").addEventListener("change", (event) => {
  importBackupFile(event.target.files?.[0]);
});

document.querySelector("#product-form").addEventListener("submit", (event) => {
  event.preventDefault();

  const product = {
    id: document.querySelector("#product-id").value || crypto.randomUUID(),
    name: document.querySelector("#product-name").value.trim(),
    category: document.querySelector("#product-category").value.trim(),
    stock: Number(document.querySelector("#product-stock").value),
    minStock: Number(document.querySelector("#product-min-stock").value),
    price: Number(document.querySelector("#product-price").value)
  };

  const index = state.products.findIndex((item) => item.id === product.id);
  if (index >= 0) {
    state.products[index] = product;
  } else {
    state.products.push(product);
  }

  saveState();
  render();
  document.querySelector("#product-dialog").close();
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

  const product = state.products.find((item) => item.id === document.querySelector("#sale-product").value);
  const customer = state.customers.find((item) => item.id === document.querySelector("#sale-customer").value);
  const quantity = Number(document.querySelector("#sale-quantity").value);
  const total = product ? quantity * product.price : 0;
  const paidAmount = Number(document.querySelector("#sale-paid").value);

  if (!product || !customer || quantity < 1 || quantity > product.stock) {
    alert("Revisa la cantidad disponible antes de registrar la venta.");
    return;
  }

  if (paidAmount < 0 || paidAmount > total) {
    alert("El monto pagado debe estar entre 0 y el total de la venta.");
    return;
  }

  product.stock -= quantity;
  state.sales.unshift({
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    customerId: customer.id,
    customerName: customer.name,
    quantity,
    detail: `${product.name} x ${quantity}`,
    total,
    paidAmount,
    date: new Date().toISOString()
  });

  document.querySelector("#sale-quantity").value = 1;
  document.querySelector("#sale-paid").value = 0;
  saveState();
  render();
});

document.body.addEventListener("click", (event) => {
  const viewCustomerId = event.target.dataset.viewCustomer;
  const editProductId = event.target.dataset.editProduct;
  const deleteProductId = event.target.dataset.deleteProduct;
  const editCustomerId = event.target.dataset.editCustomer;
  const deleteCustomerId = event.target.dataset.deleteCustomer;

  if (viewCustomerId) {
    openCustomerDetail(viewCustomerId);
  }

  if (editProductId) {
    openProductDialog(state.products.find((product) => product.id === editProductId));
  }

  if (deleteProductId && confirm("Eliminar este producto?")) {
    state.products = state.products.filter((product) => product.id !== deleteProductId);
    saveState();
    render();
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
  state = structuredClone(demoState);
  saveState();
  render();
});

render();

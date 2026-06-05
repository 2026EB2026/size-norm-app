/**
 * Size Norm PDP block — client-side variant change handler.
 *
 * Strategy:
 *   1. On connect, parse the embedded JSON map (variantId → matrix data).
 *   2. Find the product form's `id` input (Shopify standard) and observe it
 *      for value changes via MutationObserver.
 *   3. Re-render the conversion area when the selected variant changes.
 *
 * Cross-theme compatible: works with Dawn, Refresh, Symmetry, Impulse,
 * Prestige, etc. because it doesn't depend on theme-specific custom elements
 * — only the universal `<input name="id">` inside the cart form.
 *
 * Fraction formatting: the metafield stores values as the merchant chose in
 * Settings, so we don't reformat client-side. This keeps the component
 * deterministic and SSR/client-render output identical.
 */

class SizeNormTable extends HTMLElement {
  constructor() {
    super();
    this._variantMap = null;
    this._observer = null;
    this._currentVariantId = null;
    this._labels = null;
  }

  connectedCallback() {
    this._variantMap = this._parseVariantMap();
    this._labels = this._readLabels();
    this._wireVariantWatcher();
  }

  disconnectedCallback() {
    if (this._observer !== null) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  _parseVariantMap() {
    const scriptEl = this.querySelector("script[data-size-norm-variants]");
    if (scriptEl === null) return {};
    try {
      return JSON.parse(scriptEl.textContent ?? "{}");
    } catch (e) {
      console.warn("[size-norm] failed to parse variant map", e);
      return {};
    }
  }

  /**
   * Localized labels are exposed via `data-label-*` attributes on the root
   * so the JS can render the table without a fetch. The block sets these in
   * a follow-up patch; for now we ship sensible fallbacks.
   */
  _readLabels() {
    return {
      us: this.dataset.labelUs ?? "US",
      eu: this.dataset.labelEu ?? "EU",
      uk: this.dataset.labelUk ?? "UK",
      cm: this.dataset.labelCm ?? "CM",
      jp: this.dataset.labelJp ?? "JP-mm",
      sourceLabel: this.dataset.labelSource ?? "Tag",
      showAll: this.dataset.labelShowAll ?? "Show full conversion",
      noData: this.dataset.labelNoData ?? "No conversion available for this variant.",
    };
  }

  _wireVariantWatcher() {
    // Find the closest cart form. Shopify themes all wrap variant selectors
    // in a form that posts to /cart/add and contains a hidden `id` input.
    const form =
      this.closest('form[action*="/cart/add"]') ??
      document.querySelector('form[action*="/cart/add"]');
    if (form === null) return;

    const idInput = form.querySelector('input[name="id"]');
    if (idInput === null) return;

    this._currentVariantId = idInput.value;

    // MutationObserver watches the `value` attribute. Themes that update the
    // input via JS also trigger an attribute write, which fires our callback.
    const observer = new MutationObserver(() => {
      const newId = idInput.value;
      if (newId !== this._currentVariantId) {
        this._currentVariantId = newId;
        this._renderForVariant(newId);
      }
    });
    observer.observe(idInput, {
      attributes: true,
      attributeFilter: ["value"],
    });

    // Some themes set the value via the `.value` property without an attribute
    // mutation. Also listen for `change` and `input` events on the form to
    // catch those.
    const onChange = () => {
      const newId = idInput.value;
      if (newId !== this._currentVariantId) {
        this._currentVariantId = newId;
        this._renderForVariant(newId);
      }
    };
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);

    this._observer = observer;
  }

  _renderForVariant(variantId) {
    const container = this.querySelector("[data-size-norm-container]");
    if (container === null) return;

    const variantData = this._variantMap[variantId];
    if (
      variantData === undefined ||
      variantData === null ||
      variantData.matrix === null
    ) {
      container.innerHTML = `<p class="size-norm__no-data">${this._escape(this._labels.noData)}</p>`;
      return;
    }

    const mode = this.dataset.displayMode ?? "MAIN_PLUS_TABLE";
    const defaultScale = this.dataset.defaultScale ?? "EU";
    container.innerHTML = this._renderHtml(
      variantData.matrix,
      variantData.source_label,
      mode,
      defaultScale,
    );
  }

  _mainValueFor(matrix, defaultScale) {
    switch (defaultScale) {
      case "US":
        return { label: this._labels.us, value: matrix.us };
      case "UK":
        return { label: this._labels.uk, value: matrix.uk };
      case "CM":
        return { label: this._labels.cm, value: matrix.cm };
      case "JP_MM":
        return { label: this._labels.jp, value: matrix.jpMm };
      default:
        return { label: this._labels.eu, value: matrix.eu };
    }
  }

  _displayValue(v) {
    if (v === null || v === undefined) return "—";
    return String(v);
  }

  _renderHtml(matrix, sourceLabel, mode, defaultScale) {
    const main = this._mainValueFor(matrix, defaultScale);
    const us = this._displayValue(matrix.us);
    const eu = this._displayValue(matrix.eu);
    const uk = this._displayValue(matrix.uk);
    const cm = this._displayValue(matrix.cm);
    const jp = this._displayValue(matrix.jpMm);
    const source = sourceLabel ?? "";

    if (mode === "SINGLE_SCALE") {
      const sourceRow = source
        ? `<dt class="size-norm__source-label-key">${this._escape(this._labels.sourceLabel)}</dt><dd>${this._escape(source)}</dd>`
        : "";
      return `<dl class="size-norm__pair size-norm__pair--single">
        <dt>${this._escape(main.label)}</dt>
        <dd>${this._escape(this._displayValue(main.value))}</dd>
        ${sourceRow}
      </dl>`;
    }

    const tableHtml = `
      <table class="size-norm__table">
        <thead>
          <tr>
            <th>${this._escape(this._labels.us)}</th>
            <th>${this._escape(this._labels.eu)}</th>
            <th>${this._escape(this._labels.uk)}</th>
            <th>${this._escape(this._labels.cm)}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${this._escape(us)}</td>
            <td>${this._escape(eu)}</td>
            <td>${this._escape(uk)}</td>
            <td>${this._escape(cm)}</td>
          </tr>
        </tbody>
      </table>`;

    if (mode === "FULL_TABLE") {
      return tableHtml;
    }

    // MAIN_PLUS_TABLE
    const sourceSpan =
      source && source !== this._displayValue(main.value)
        ? `<span class="size-norm__main-source">(${this._escape(source)})</span>`
        : "";
    return `
      <div class="size-norm__main">
        <span class="size-norm__main-label">${this._escape(main.label)}</span>
        <span class="size-norm__main-value">${this._escape(this._displayValue(main.value))}</span>
        ${sourceSpan}
      </div>
      <details class="size-norm__details">
        <summary>${this._escape(this._labels.showAll)}</summary>
        ${tableHtml}
      </details>`;
  }

  _escape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
}

if (!customElements.get("size-norm-table")) {
  customElements.define("size-norm-table", SizeNormTable);
}

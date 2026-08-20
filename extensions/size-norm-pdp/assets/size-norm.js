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
 * Presentation is driven entirely by data-* attributes written by the Liquid
 * block from the merchant's theme-editor settings (enabled columns, labels,
 * highlight on/off, source label on/off), so this file and the Liquid
 * snippet always produce the same markup.
 *
 * Fraction formatting: the metafield stores values as the merchant chose in
 * Settings, so we don't reformat client-side. This keeps the component
 * deterministic and SSR/client-render output identical.
 */

/** Column order must mirror the Liquid snippet. */
const COLUMN_ORDER = ["us", "eu", "uk", "cm", "jp"];

/** Maps a column key to the matrix property that holds its value. */
const COLUMN_FIELD = {
  us: "us",
  eu: "eu",
  uk: "uk",
  cm: "cm",
  jp: "jpMm",
};

/** Maps the `default_scale` setting to a column key. */
const SCALE_TO_COLUMN = {
  US: "us",
  EU: "eu",
  UK: "uk",
  CM: "cm",
  JP_MM: "jp",
};

class SizeNormTable extends HTMLElement {
  constructor() {
    super();
    this._variantMap = null;
    this._observer = null;
    this._currentVariantId = null;
    this._labels = null;
    this._columns = null;
  }

  connectedCallback() {
    this._variantMap = this._parseVariantMap();
    this._labels = this._readLabels();
    this._columns = this._readColumns();
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
   * Localized (and merchant-overridable) labels come from `data-label-*`
   * attributes on the root, so the JS can render without a fetch.
   */
  _readLabels() {
    return {
      us: this.dataset.labelUs ?? "US",
      eu: this.dataset.labelEu ?? "EU",
      uk: this.dataset.labelUk ?? "UK",
      cm: this.dataset.labelCm ?? "CM",
      jp: this.dataset.labelJp ?? "JP",
      sourceLabel: this.dataset.labelSource ?? "Tag",
      showAll: this.dataset.labelShowAll ?? "Show full conversion",
      noData: this.dataset.labelNoData ?? "No conversion available for this variant.",
    };
  }

  /**
   * Enabled columns, filtered and ordered to match COLUMN_ORDER. Falls back
   * to all five when the attribute is missing or unusable.
   */
  _readColumns() {
    const raw = this.dataset.columns ?? "";
    const requested = raw
      .split(",")
      .map((c) => c.trim().toLowerCase())
      .filter((c) => c.length > 0);
    const enabled = COLUMN_ORDER.filter((c) => requested.includes(c));
    return enabled.length > 0 ? enabled : [...COLUMN_ORDER];
  }

  _highlightMain() {
    return this.dataset.highlightMain !== "false";
  }

  _showSource() {
    return this.dataset.showSource !== "false";
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

  _mainColumnFor(defaultScale) {
    return SCALE_TO_COLUMN[defaultScale] ?? "eu";
  }

  _valueFor(matrix, column) {
    const field = COLUMN_FIELD[column];
    return field === undefined ? null : matrix[field];
  }

  _displayValue(v) {
    if (v === null || v === undefined) return "—";
    return String(v);
  }

  _renderHtml(matrix, sourceLabel, mode, defaultScale) {
    const mainCol = this._mainColumnFor(defaultScale);
    const mainLabel = this._labels[mainCol] ?? this._labels.eu;
    const mainValue = this._valueFor(matrix, mainCol);
    const source = sourceLabel ?? "";
    const withSource = this._showSource() && source.length > 0;

    if (mode === "SINGLE_SCALE") {
      const sourceRow = withSource
        ? `<dt class="size-norm__source-label-key">${this._escape(this._labels.sourceLabel)}</dt><dd>${this._escape(source)}</dd>`
        : "";
      return `<dl class="size-norm__pair size-norm__pair--single">
        <dt>${this._escape(mainLabel)}</dt>
        <dd>${this._escape(this._displayValue(mainValue))}</dd>
        ${sourceRow}
      </dl>`;
    }

    // Only the merchant-enabled columns, in the canonical order. The main
    // column gets `is-main` when highlighting is on, matching the Liquid SSR.
    const highlight = this._highlightMain();
    const ths = this._columns
      .map((col) => {
        const cls = highlight && col === mainCol ? ' class="is-main"' : "";
        return `<th${cls}>${this._escape(this._labels[col] ?? col.toUpperCase())}</th>`;
      })
      .join("");
    const tds = this._columns
      .map((col) => {
        const cls = highlight && col === mainCol ? ' class="is-main"' : "";
        return `<td${cls}>${this._escape(this._displayValue(this._valueFor(matrix, col)))}</td>`;
      })
      .join("");
    const tableHtml = `
      <table class="size-norm__table">
        <thead><tr>${ths}</tr></thead>
        <tbody><tr>${tds}</tr></tbody>
      </table>`;

    if (mode === "FULL_TABLE") {
      return tableHtml;
    }

    // MAIN_PLUS_TABLE
    const sourceSpan =
      withSource && source !== this._displayValue(mainValue)
        ? `<span class="size-norm__main-source">(${this._escape(source)})</span>`
        : "";
    return `
      <div class="size-norm__main">
        <span class="size-norm__main-label">${this._escape(mainLabel)}</span>
        <span class="size-norm__main-value">${this._escape(this._displayValue(mainValue))}</span>
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

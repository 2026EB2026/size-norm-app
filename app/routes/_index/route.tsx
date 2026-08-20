import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

/**
 * Public landing page — the app's own URL opened outside the Shopify admin.
 *
 * Deliberately contains no shop-domain input. App Store requirement 2.3.1
 * forbids asking merchants to type a `myshopify.com` domain as part of the
 * install or configuration flow: installs must start from a Shopify-owned
 * surface (the App Store listing, or the admin). A merchant who arrives here
 * with a `shop` param is already coming from Shopify, so we hand them
 * straight to the embedded app; everyone else just reads what the app does.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

export default function Index() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Size Norm</h1>
        <p className={styles.text}>
          Normalizza le taglie di ogni brand in un&apos;unica matrice
          US / EU / UK / CM / JP e mostrala sulla pagina prodotto. Pensato per
          i retailer multibrand di calzature, dove ogni marchio numera le
          taglie a modo suo.
        </p>
        <ul className={styles.list}>
          <li>
            <strong>Scale ufficiali precaricate</strong>. Oltre cento scale
            brand-official pronte all&apos;uso, con le conversioni già
            compilate: nessuna tabella da inserire a mano.
          </li>
          <li>
            <strong>Riconoscimento automatico</strong>. La scala giusta viene
            individuata da brand, genere e categoria età del prodotto, anche
            quando le varianti sono etichettate in un sistema diverso.
          </li>
          <li>
            <strong>Tabella personalizzabile</strong>. Colonne, colori, stile e
            densità si configurano dal theme editor con anteprima dal vivo,
            senza scrivere codice.
          </li>
          <li>
            <strong>Diagnostica integrata</strong>. Per ogni prodotto vedi
            esattamente quale scala è stata usata e, se qualcosa non torna,
            cosa correggere.
          </li>
        </ul>
        <p className={styles.text}>
          L&apos;installazione avviene dallo Shopify App Store o dal pannello
          di amministrazione del negozio.
        </p>
      </div>
    </div>
  );
}

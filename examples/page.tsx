type Product = {
  id: string;
  title: string;
  priceInCents: number;
  currency: string;
};

type PageProps = {
  products: Record<string, Product>;
};

const featuredProductId = "cup-blue";

function Note({ title }: { title: string }) {
  return (
    <aside className="note">
      <h2>{title}</h2>
    </aside>
  );
}

function ProductCard({ product }: { product: Product }) {
  const formattedPrice = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency,
  }).format(product.priceInCents / 100);

  return (
    <article className="product-card">
      <h2>{product.title}</h2>
      <p className="price">{formattedPrice}</p>
    </article>
  );
}

export default function Page({ products }: PageProps) {
  const featured = products[featuredProductId];

  if (!featured) {
    return <p>The selected product is unavailable.</p>;
  }

  return (
    <main>
      <h1>Objects for small spaces</h1>
      <section className="notes">
        <Note title="Made for small spaces" />
        <Note title="Made for small spaces" />
      </section>
      <ProductCard product={featured} />
    </main>
  );
}

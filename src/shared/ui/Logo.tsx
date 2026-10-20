export function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand ${small ? "small" : ""}`}>
      <span className="brand-icon">
        s<span>r</span>
      </span>
      <span>
        Srs<span className="muted">Reader</span>
      </span>
    </span>
  );
}

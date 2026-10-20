export function ReadingColumn({ children, className = "" }) {
  const classes = className ? `reading ${className}` : "reading";
  return <div className={classes}>{children}</div>;
}

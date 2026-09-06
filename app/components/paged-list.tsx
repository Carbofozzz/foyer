"use client";

import { Children, useMemo, useState, type ReactNode } from "react";

const PAGE_SIZE = 24;

export function PagedList({
  children,
  className,
  pageSize = PAGE_SIZE,
  prevLabel,
  nextLabel,
  pageOf,
}: {
  children: ReactNode;
  className?: string;
  pageSize?: number;
  prevLabel: string;
  nextLabel: string;
  pageOf: string;
}) {
  const items = useMemo(() => Children.toArray(children), [children]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const [page, setPage] = useState(1);
  const current = Math.min(page, pages);
  const slice = items.slice((current - 1) * pageSize, current * pageSize);

  return (
    <>
      <ul className={className}>{slice}</ul>
      {pages > 1 ? (
        <div className="pager">
          <button type="button" className="ghost" disabled={current <= 1} onClick={() => setPage(current - 1)}>
            {prevLabel}
          </button>
          <span className="muted">
            {pageOf.replace("{page}", String(current)).replace("{pages}", String(pages))}
          </span>
          <button type="button" className="ghost" disabled={current >= pages} onClick={() => setPage(current + 1)}>
            {nextLabel}
          </button>
        </div>
      ) : null}
    </>
  );
}

"use client";

import { Children, useState, type ReactNode } from "react";
import { PagedList } from "@/app/components/paged-list";

export function InboxFeed({
  chips,
  testPass,
  showToggle,
  empty,
  showLabel,
  hideLabel,
  prevLabel,
  nextLabel,
  pageOf,
  children,
}: {
  chips?: ReactNode;
  testPass: boolean[];
  showToggle: boolean;
  empty: string;
  showLabel: string;
  hideLabel: string;
  prevLabel: string;
  nextLabel: string;
  pageOf: string;
  children: ReactNode;
}) {
  const [showTests, setShowTests] = useState(false);
  const rows = Children.toArray(children).filter((_, index) => showTests || !testPass[index]);

  return (
    <>
      {chips || showToggle ? (
        <div className="agent-chips-block">
          {chips}
          {showToggle ? (
            <p className="feed-toolbar">
              <button type="button" className="quiet" onClick={() => setShowTests((open) => !open)}>
                {showTests ? hideLabel : showLabel}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <p className="empty">{empty}</p>
      ) : (
        <PagedList className="feed" prevLabel={prevLabel} nextLabel={nextLabel} pageOf={pageOf}>
          {rows}
        </PagedList>
      )}
    </>
  );
}

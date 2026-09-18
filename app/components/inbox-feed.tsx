"use client";

import { Children, useState, type ReactNode } from "react";
import { PagedList } from "@/app/components/paged-list";
import { SHOW_TESTS_COOKIE, writeClientCookie } from "@/app/lib/cabinet-ui";

export function InboxFeed({
  chips,
  testPass,
  needsDecide,
  showToggle,
  showTests: showTestsStart = false,
  empty,
  emptyNeedsYou,
  showLabel,
  hideLabel,
  needsYouLabel,
  allEventsLabel,
  prevLabel,
  nextLabel,
  pageOf,
  children,
}: {
  chips?: ReactNode;
  testPass: boolean[];
  needsDecide: boolean[];
  showToggle: boolean;
  showTests?: boolean;
  empty: string;
  emptyNeedsYou: string;
  showLabel: string;
  hideLabel: string;
  needsYouLabel: string;
  allEventsLabel: string;
  prevLabel: string;
  nextLabel: string;
  pageOf: string;
  children: ReactNode;
}) {
  const [showTests, setShowTests] = useState(showTestsStart);
  const [onlyDecide, setOnlyDecide] = useState(false);
  const rows = Children.toArray(children).filter((_, index) => {
    if (!showTests && testPass[index]) return false;
    if (onlyDecide && !needsDecide[index]) return false;
    return true;
  });

  return (
    <>
      <div className="agent-chips-block">
        {chips}
        <p className="feed-toolbar">
          <button
            type="button"
            className={onlyDecide ? "quiet is-on" : "quiet"}
            aria-pressed={onlyDecide}
            onClick={() => setOnlyDecide((on) => !on)}
          >
            {onlyDecide ? allEventsLabel : needsYouLabel}
          </button>
          {showToggle ? (
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setShowTests((open) => {
                  const next = !open;
                  writeClientCookie(SHOW_TESTS_COOKIE, next ? "1" : "0");
                  return next;
                });
              }}
            >
              {showTests ? hideLabel : showLabel}
            </button>
          ) : null}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="empty">{onlyDecide ? emptyNeedsYou : empty}</p>
      ) : (
        <PagedList className="feed" prevLabel={prevLabel} nextLabel={nextLabel} pageOf={pageOf}>
          {rows}
        </PagedList>
      )}
    </>
  );
}

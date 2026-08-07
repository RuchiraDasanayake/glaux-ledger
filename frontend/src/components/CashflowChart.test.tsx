import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CashflowChart } from "@/components/CashflowChart";
import type { DailyPoint } from "@/lib/types";

function point(day: string, income: string, expense: string): DailyPoint {
  return {
    day,
    income,
    expense,
    net: String(Number(income) - Number(expense)),
  };
}

const WEEK: DailyPoint[] = [
  point("2026-07-27", "1000.00", "200.00"),
  point("2026-07-28", "0.00", "0.00"),
  point("2026-07-29", "2500.00", "400.00"),
  point("2026-07-30", "800.00", "35000.00"),
  point("2026-07-31", "1200.00", "0.00"),
  point("2026-08-01", "3000.00", "600.00"),
  point("2026-08-02", "900.00", "150.00"),
];

/**
 * The line beside the heading that names one day. Scoped rather than queried globally,
 * because the screen-reader table further down carries every date on the chart.
 */
function readout(): HTMLElement {
  return screen.getByRole("heading", { name: /Last \d+ days/ })
    .parentElement as HTMLElement;
}

describe("CashflowChart", () => {
  it("shows every day of the window, quiet ones included", () => {
    render(<CashflowChart points={WEEK} currency="LKR" />);

    const rows = within(screen.getByRole("table")).getAllByRole("row");
    // One header row plus one per day.
    expect(rows).toHaveLength(WEEK.length + 1);
    expect(
      screen.getByRole("rowheader", { name: /Tue 28 Jul/ }),
    ).toBeInTheDocument();
  });

  it("reads out today at rest, not whichever day happens to be tallest", () => {
    render(<CashflowChart points={WEEK} currency="LKR" />);

    // 30 July is the Rs 35,000 rent day and dominates the chart; 2 August is today.
    expect(readout()).toHaveTextContent("Sun 2 Aug");
    expect(readout()).not.toHaveTextContent("30 Jul");
  });

  it("reads out the day under the pointer", async () => {
    const user = userEvent.setup();
    render(<CashflowChart points={WEEK} currency="LKR" />);

    const columns = screen.getByRole("img").children;
    // Index 0 is the zero line; the columns follow it in order.
    await user.hover(columns[3] as Element);

    expect(readout()).toHaveTextContent("Wed 29 Jul");
  });

  it("totals the whole window, not the day", () => {
    render(<CashflowChart points={WEEK} currency="LKR" />);

    const [income, expense, net] = screen.getAllByRole("definition");
    expect(income).toHaveTextContent("9,400");
    expect(expense).toHaveTextContent("36,350");
    expect(net).toHaveTextContent("-26,950");
  });

  it("scales both directions against one peak, so the shape does not lie", () => {
    const { container } = render(
      <CashflowChart points={WEEK} currency="LKR" />,
    );
    const heights = [
      ...container.querySelectorAll<HTMLElement>("[style*='height']"),
    ].map((bar) => parseFloat(bar.style.height));

    // The Rs 35,000 rent is the largest single figure in either direction, so it is the
    // only full-height bar. Were the halves scaled separately, the Rs 3,000 income day
    // would be full height too and the month would look balanced.
    expect(heights.filter((height) => height === 100)).toHaveLength(1);
  });

  it("says so plainly when there is nothing to draw", () => {
    const empty = WEEK.map((day) => point(day.day, "0.00", "0.00"));
    render(<CashflowChart points={empty} currency="LKR" />);

    expect(
      screen.getByText(/Nothing recorded in the last 7 days/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows a skeleton rather than an empty chart while loading", () => {
    render(<CashflowChart points={[]} currency="LKR" loading />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

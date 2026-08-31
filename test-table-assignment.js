import tableAssignmentService from "./src/modules/restaurant/table/table-assignment.service.js";

const tables = [
  {
    id: "1",
    name: "T1",
    capacity: 2,
  },
  {
    id: "2",
    name: "T2",
    capacity: 2,
  },
  {
    id: "3",
    name: "T3",
    capacity: 4,
  },
  {
    id: "4",
    name: "T4",
    capacity: 6,
  },
];

const testCases = [
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  10,
  11,
  15,
];

for (const guestCount of testCases) {
  const result =
    tableAssignmentService.findBestTableCombination(
      tables,
      guestCount
    );

  console.log(
    `\n${guestCount} personen:`
  );

  if (!result) {
    console.log("Geen combinatie gevonden.");
    continue;
  }

  console.log(
    result.tables.map(
      (table) => table.name
    )
  );

  console.log(
    `Capaciteit: ${result.capacity}`
  );
}
# Fixtures

Every row in these files is invented. The makes (Samplecar, Testmotor) do not exist, and the numbers are not real ratings.
The header line is the 15 column names Natural Resources Canada lists for its model-year files. The files exist to test
the reader on awkward input, not to stand in for the real data.

| File | What it checks |
| --- | --- |
| `sample-good.csv` | A byte-order mark, CRLF line endings, a quoted model name with a comma and a quote in it, a decimal comma, an empty trailing line |
| `sample-bad-rows.csv` | A blank rating, a dash, a rating of 0.2 and 99, an electric row, an unknown fuel code, a wrong model year, a blank make, one exact duplicate |
| `sample-missing-column.csv` | The "Highway" column removed |
| `sample-extra-column.csv` | An extra column and shuffled column order |
| `sample-ev.csv` | An electric-vehicle file: kWh columns and no L/100 km columns |
| `sample-error-page.csv` | An HTML error page that was saved with a .csv name |

---
name: csv-dedupe
description: Remove duplicate rows from CSV files. Use when the user asks to deduplicate, find duplicate rows, or clean repeated entries in a CSV.
---
# CSV dedupe

Load the file with pandas, call `drop_duplicates()`, and write the result next to the original as `<name>.dedup.csv`.

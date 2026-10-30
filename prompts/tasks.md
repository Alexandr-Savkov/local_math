## Generate set of tasks for "Variant game"

- generate combination of question from nultiple table from 2 to 6.
 example:
  {
    question: '3 * 6',
    variants: [20, 18, 24],
    answer: 18,
  }
  Idea to keep inside variants one correct answer, one very close answer +-2, and one answer as the next step in multiple table, f.e 4*4 - 16, 13, 20. 20 is the next step as 4*5

  Generate json files for every table: 2, 3, 4 etc in separate folder. Create interface for it
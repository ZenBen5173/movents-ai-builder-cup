// Which planned item a budget line is (e.g. "food", "lanyard"), so a line the
// committee edited is kept on re-draft and not added a second time.
export default `
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS line_key text;
`;

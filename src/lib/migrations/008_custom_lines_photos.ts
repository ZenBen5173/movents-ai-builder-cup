// Budget items a committee adds by hand (kept when the budget is re-drafted),
// and a picture per supplier.
export default `
ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS custom boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS photo_url text;
`;

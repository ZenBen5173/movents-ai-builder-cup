// Shared university data has an owner: suppliers record which society added them.
export default `
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS added_by_society text;
CREATE INDEX IF NOT EXISTS idx_universities_owner ON universities (created_by_society);
`;

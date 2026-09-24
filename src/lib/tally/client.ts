/**
 * Mock Tally Client to simulate syncing ledger entries to Tally XML/JSON API.
 */
export async function pushToTally(entry: any): Promise<{ success: boolean; error?: string }> {
  console.log(`[Tally Client] Attempting to push ${entry.type} entry (ID: ${entry.id})`);
  
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Simulate an 80% success rate to test the retry/failure queue
  const isSuccess = Math.random() > 0.2;

  if (isSuccess) {
    return { success: true };
  } else {
    // Simulate some common Tally errors
    const errors = [
      'Tally Server Unreachable (Connection Refused)',
      'Invalid XML format for Voucher',
      'Item not found in Tally Master',
      'Godown not mapped in Tally'
    ];
    const randomError = errors[Math.floor(Math.random() * errors.length)];
    return { success: false, error: randomError };
  }
}

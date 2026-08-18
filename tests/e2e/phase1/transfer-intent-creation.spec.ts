/**
 * W7-Batch-2 Q1: Transfer Intent Creation Flow
 * Tests complete wallet-to-intent creation lifecycle
 */

describe('TransferIntentCreation', () => {
  beforeEach(() => {
    // Mock Face frontend components
    cy.mockFaceComponents();
    // Stub API layer
    cy.stubApi('/api/wallets/*');
    cy.stubApi('/api/intents/create');
    // Prepare database fixtures
    cy.prepareTestFixturetures();
  });

  it('creates new transfer intent with valid inputs', () => {
    // Scenario: User creates valid transfer intent via WalletDetail page
    cy.visit('/wallets/default/transfers/new');
    
    // Fill transfer form
    cy.get('[data-testid="recipient-address"]').type('0x123...abc');
    cy.get('[data-testid="amount"]').type('100');
    cy.get('[data-testid="token-select"] select').select('USDC');
    cy.get('[data-testid="submit-transfer"]').click();
    
    // Verify security gate evaluation triggered
    cy.wait('@security-evaluate');
    cy.contains(/Security Gate Evaluating:/).should('be.visible');
    
    // Verify pending state shown
    cy.get('[data-testid="intent-status"]').should('have.class', 'pending');
  });

  it('validates balance before intent submission', () => {
    // Scenario: Attempt transfer exceeding wallet balance
    cy.visit('/wallets/default/transfers/new');
    
    // Set unrealistic amount that exceeds balance
    cy.get('[data-testid="amount"]').type('999999999');
    cy.get('[data-testid="submit-transfer"]').click();
    
    // Should show validation error
    cy.contains(/Insufficient Balance/).should('be.visible');
  });
});

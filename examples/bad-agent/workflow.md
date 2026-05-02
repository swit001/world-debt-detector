# Customer Support Workflow

## Refund Request Handling

This workflow describes how refund requests are processed end to end.

### Steps

1. Customer submits a refund request via chat or email.
2. The system retrieves the order details from the order management system.
3. The agent reviews the request and determines whether the refund is eligible.
4. If eligible, the agent calls `refundPayment` with the order ID and amount.
5. The customer receives a confirmation message.

### Cancellation Handling

1. Customer requests cancellation.
2. Agent retrieves the current order status.
3. If the order is still open, the agent calls `cancelOrder`.
4. Customer receives a cancellation confirmation.

### Notes

- Always confirm with the customer before taking action.
- Escalate to a senior agent for complex cases.
- Keep the customer informed at each step.

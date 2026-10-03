import { BadRequestException } from '@nestjs/common';
import { humanizeValidationMessage, humanizeValidationMessages } from '../filters/humanize-validation';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

describe('humanizeValidationMessage', () => {
  it.each([
    ['items.0.productId must be a UUID', 'Item 1: choose a valid product.'], // the message in the bug report
    ['productId must be a UUID', 'Choose a valid product.'],
    ['items.2.bagCount must not be less than 1', 'Item 3: bag count must be at least 1.'],
    ['items.0.bagCount must not be greater than 5000', 'Item 1: bag count must be at most 5000.'],
    ['customerId should not be empty', 'Customer is required.'],
    ['email must be an email', 'Email must be a valid email address.'],
    ['quantity must be a number conforming to the specified constraints', 'Quantity must be a number.'],
    ['bagCount must be an integer number', 'Bag count must be a whole number.'],
    ['notes must be a string', 'Notes must be text.'],
    ['status must be one of the following values: DRAFT, SUBMITTED', 'Status must be one of: DRAFT, SUBMITTED.'],
    ['lines.0.items.1.kg must be an integer number', 'Line 1, Item 2: kg must be a whole number.'],
  ])('%s -> %s', (raw, plain) => expect(humanizeValidationMessage(raw)).toBe(plain));

  it('leaves any other sentence exactly as it was', () => {
    for (const m of ['Insufficient stock at this warehouse.', 'Too many failed attempts. Account locked for 15 minutes.', 'items.0 something odd']) expect(humanizeValidationMessage(m)).toBe(m);
  });
  it('handles a whole list, and a message that is not text', () => {
    expect(humanizeValidationMessages(['a.0.b must be a UUID', 42 as unknown as string])).toEqual(['A 1: choose a valid b.', '42']);
  });
});

describe('AllExceptionsFilter', () => {
  it('sends the plain sentence to the screen for a failed validation', () => {
    const json = jest.fn();
    const response = { status: jest.fn().mockReturnValue({ json }) };
    const host = { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ method: 'POST', url: '/api/sales-orders' }) }) };
    new AllExceptionsFilter().catch(new BadRequestException({ message: ['items.0.productId must be a UUID'], error: 'Bad Request', statusCode: 400 }), host as any);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false, message: 'Item 1: choose a valid product.' }));
  });
});

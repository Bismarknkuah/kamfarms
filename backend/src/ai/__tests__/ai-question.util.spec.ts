import { parseYieldQuestion } from '../ai-question.util';

describe('parseYieldQuestion: the numbers in a prediction question', () => {
  it.each([
    ['I milled 5 bags size 4, what should it give?', { paddy_bags: 5, grade: 'size 4' }],
    ['what will 5 bags of Size 4 paddy give', { paddy_bags: 5, grade: 'size 4' }],
    ['If we mill 5 bags of Size 4, how much power will it use?', { paddy_bags: 5, grade: 'size 4' }],
    ['how much rice and power from 120 bags of paddy', { paddy_bags: 120 }],
    ['What do 1,000 bags of paddy rice give?', { paddy_bags: 1000 }],
    ['we sent 40 bags to the mill, what should we expect', { paddy_bags: 40 }],
    ['I milled 12.5 bags, what is the expected output', { paddy_bags: 12.5 }],
  ])('reads paddy bags from "%s"', (q, expected) => {
    expect(parseYieldQuestion(q)).toEqual(expected);
  });

  it.each([
    ['how much paddy and power do I need for 100 bags of rice?', { rice_bags: 100 }],
    ['we recovered 54 bags of rice, how much paddy did that take?', { rice_bags: 54 }],
    ['I want 200 bags of packaged rice, how much paddy must I mill', { rice_bags: 200 }],
    ['to get 75 bags of finished rice what do we need', { rice_bags: 75 }],
  ])('reads rice bags from "%s"', (q, expected) => {
    expect(parseYieldQuestion(q)).toEqual(expected);
  });

  it.each([
    ['what will 200 kWh give?', { kwh: 200 }],
    ['how much does 1,500 kilowatt hours mill', { kwh: 1500 }],
    ['If the meter shows 50 kWh, what should size 4 have given', { kwh: 50, grade: 'size 4' }],
  ])('reads power from "%s"', (q, expected) => {
    expect(parseYieldQuestion(q)).toEqual(expected);
  });

  it('says "paddy" wins over "rice" in "paddy rice", because that is how paddy is talked about here', () => {
    expect(parseYieldQuestion('how much power for 30 bags of paddy rice')).toEqual({ paddy_bags: 30 });
  });

  it.each([
    'how many bags of rice do we have in stock',
    'we have 50 bags of rice in the warehouse',
    'sales this month were 50 bags',
    'What does 1 kWh of power produce?',
    'who approved order SO-2026-000004',
    'how do I record paddy',
    '',
  ])('leaves an ordinary question alone: "%s"', (q) => {
    expect(parseYieldQuestion(q)).toBeNull();
  });
});

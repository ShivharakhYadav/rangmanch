import { IsIn } from 'class-validator';

/** Dev-only: drive the mock gateway's payment outcome. */
export class MockPayDto {
  @IsIn(['success', 'fail'])
  outcome!: 'success' | 'fail';
}

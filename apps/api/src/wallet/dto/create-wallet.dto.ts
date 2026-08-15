import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { CHAINS, type ChainId } from '@kryptr/shared-types';
import { ADDRESS_PATTERN } from '../../common/address';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  ownerId!: string;

  @IsString()
  @Matches(ADDRESS_PATTERN, {
    message: 'address must be a 0x-prefixed 40-hex-char EVM address',
  })
  address!: `0x${string}`;

  /** DTO accepts every known chain; the domain allowlist narrows it. */
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(CHAINS, { each: true })
  chains!: ChainId[];
}

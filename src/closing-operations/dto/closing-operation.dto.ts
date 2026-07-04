import { IsBoolean } from 'class-validator';

export class SaveClosingOperationDto {
  @IsBoolean()
  regionalCooperation!: boolean;

  @IsBoolean()
  transitionPrep!: boolean;

  @IsBoolean()
  absenceHandling!: boolean;
}

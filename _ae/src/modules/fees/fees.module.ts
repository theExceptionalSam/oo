import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeeStructure } from './entities/fee-structure.entity';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeeStructure])],
  controllers: [FeesController],
  providers: [FeesService],
  exports: [FeesService],
})
export class FeesModule {}

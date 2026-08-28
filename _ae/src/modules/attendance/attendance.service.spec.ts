import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { EventBus } from '../../shared/events/event-bus.module';

import { AttendanceService } from './attendance.service';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
import { Class } from '../classes/entities/class.entity';
import { BulkMarkAttendanceDto } from './dto/bulk-attendance.dto';

describe('AttendanceService', () => {
  let service: AttendanceService;
  let repo: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    manager: unknown;
  };
  let classesRepo: { findOne: jest.Mock };
  let eventBus: { publish: jest.Mock };

  beforeEach(async () => {
    repo = {
      create: jest.fn((dto) => dto),
      createQueryBuilder: jest.fn(() => ({
        insert: () => ({
          into: () => ({
            values: () => ({
              orUpdate: () => ({ execute: jest.fn().mockResolvedValue(undefined) }),
            }),
          }),
        }),
        select: () => ({
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          getRawData: jest
            .fn()
            .mockResolvedValue([
              { studentId: 's1', present: '4', absent: '1', late: '0', excused: '0' },
            ]),
          getRawMany: jest
            .fn()
            .mockResolvedValue([
              { studentId: 's1', present: '4', absent: '1', late: '0', excused: '0' },
            ]),
        }),
      })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      manager: {
        transaction: jest.fn(async (fn) => {
          const manager = {
            delete: jest.fn().mockResolvedValue(undefined),
            save: jest.fn().mockResolvedValue(undefined),
          };
          return fn(manager);
        }),
      },
    };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    classesRepo = { findOne: jest.fn().mockResolvedValue({ id: 'class-1', schoolId: 'school-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: ScopeService, useValue: { studentIdsFor: async () => null, classIdsForTeacher: async () => [] } },
        AttendanceService,
        { provide: getRepositoryToken(Attendance), useValue: repo },
        { provide: getRepositoryToken(Class), useValue: classesRepo },
        { provide: EventBus, useValue: eventBus },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  it('bulk-marks attendance and publishes absent events', async () => {
    const dto: BulkMarkAttendanceDto = {
      classId: 'class-1',
      date: '2025-01-15',
      entries: [
        { studentId: 's1', status: AttendanceStatus.PRESENT },
        { studentId: 's2', status: AttendanceStatus.ABSENT },
      ],
    };

    const result = await service.bulkMark(dto, 'teacher-1');
    expect(result.total).toBe(2);
    expect(result.absentCount).toBe(1);
    expect(eventBus.publish).toHaveBeenCalledWith('attendance.absent', expect.objectContaining({ studentId: 's2' }));
    expect(eventBus.publish).toHaveBeenCalledWith('attendance.marked', expect.any(Object));
  });

  it('aggregates attendance report correctly', async () => {
    const report = await service.report({
      classId: 'class-1',
      from: new Date('2025-01-01'),
      to: new Date('2025-01-31'),
    });
    expect(report).toHaveLength(1);
    expect(report[0].present).toBe(4);
    expect(report[0].absent).toBe(1);
    expect(report[0].rate).toBeCloseTo(0.8, 5);
  });
});

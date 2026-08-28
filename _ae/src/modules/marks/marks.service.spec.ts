import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ScopeService } from '../../common/scope/scope.service';
import { EventBus } from '../../shared/events/event-bus.module';

import { MarksService } from './marks.service';
import { Mark } from './entities/mark.entity';
import { Exam } from '../exams/entities/exam.entity';
import { School } from '../schools/entities/school.entity';
import { BulkUploadMarksDto } from './dto/bulk-marks.dto';

describe('MarksService', () => {
  let service: MarksService;
  let repo: {
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
    findAndCount: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
    find: jest.Mock;
  };
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
      })),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      findOne: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
      find: jest.fn().mockResolvedValue([
        { studentId: 's1', subjectId: 'sub1', marksObtained: 80, grade: 'A', createdAt: new Date() },
        { studentId: 's1', subjectId: 'sub2', marksObtained: 60, grade: 'B', createdAt: new Date() },
      ]),
    };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };

    const examRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'exam-1', schoolId: 'school-1', maxMarks: 100, status: 'draft' }),
    };
    const schoolRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'school-1', settings: {} }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarksService,
        { provide: ScopeService, useValue: { studentIdsFor: async () => null, classIdsForTeacher: async () => [] } },
        { provide: getRepositoryToken(Mark), useValue: repo },
        { provide: getRepositoryToken(Exam), useValue: examRepo },
        { provide: getRepositoryToken(School), useValue: schoolRepo },
        { provide: EventBus, useValue: eventBus },
      ],
    }).compile();

    service = module.get(MarksService);
  });

  it('bulk-uploads marks and publishes exam.published', async () => {
    const dto: BulkUploadMarksDto = {
      entries: [
        { studentId: 's1', subjectId: 'sub1', marksObtained: 90 },
        { studentId: 's2', subjectId: 'sub1', marksObtained: 75 },
      ],
    };

    const result = await service.bulkUpload('exam-1', dto, 'teacher-1');
    expect(result.total).toBe(2);
    expect(eventBus.publish).toHaveBeenCalledWith('exam.published', expect.objectContaining({ examId: 'exam-1' }));
  });

  it('computes report card GPA', async () => {
    const card = await service.reportCard('s1');
    expect(card.subjects).toHaveLength(2);
    expect(card.gpa).toBeGreaterThan(0);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../src/common/decorators/public.decorator';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

@Controller('ping')
class PingController {
  @Public()
  @Get()
  ping() {
    return { ok: true };
  }
}

@Module({
  controllers: [PingController],
})
class PingModule {}

describe('Health & envelope (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PingModule],
    })
      .overrideProvider(ResponseInterceptor)
      .useValue(new ResponseInterceptor())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /ping returns the success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/ping');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { ok: true } });
  });
});

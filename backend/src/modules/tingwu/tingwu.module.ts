import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { TingwuService } from "./tingwu.service";

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
    }),
  ],
  providers: [TingwuService],
  exports: [TingwuService],
})
export class TingwuModule {}

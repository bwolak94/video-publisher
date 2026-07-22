import {
  Controller, Get, Post, Put, Delete,
  Param, Body, Request, UseGuards, HttpCode, HttpStatus,
} from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { ChannelsService, CreateChannelDto, UpdateChannelDto } from "./channels.service";

@Controller("api/channels")
@UseGuards(AuthGuard)
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  /** List all channels owned by the authenticated user. */
  @Get()
  findAll(@Request() req: any) {
    return this.channels.findAll(req.user.sub);
  }

  /** Create a new channel for the authenticated user. */
  @Post()
  create(@Request() req: any, @Body() dto: CreateChannelDto) {
    return this.channels.create(req.user.sub, dto);
  }

  /** Get a single channel (must belong to the user). */
  @Get(":id")
  findOne(@Request() req: any, @Param("id") id: string) {
    return this.channels.findOne(req.user.sub, id);
  }

  /** Update channel fields (partial update). */
  @Put(":id")
  update(@Request() req: any, @Param("id") id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(req.user.sub, id, dto);
  }

  /** Delete a channel and all its associated data. */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Request() req: any, @Param("id") id: string) {
    return this.channels.delete(req.user.sub, id);
  }
}

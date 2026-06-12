import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

class LoginDto {
  @IsString()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Đăng nhập CMS (email + mật khẩu)" })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email.trim(), dto.password);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Thông tin người dùng hiện tại (xác thực token)" })
  me(@Req() req: any) {
    return this.auth.me(req.user.sub);
  }
}

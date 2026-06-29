using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using AutoMapper;
using Moq;
using Xunit;
using SmartAttendance.Helper;

public class MarkAttendanceTests
{
    private readonly Mock<IStudentRepository> _studentRepositoryMock;
    private readonly Mock<IMapper> _mapperMock;
    private readonly AttendanceService _sut; // replace with actual class name

    public MarkAttendanceTests()
    {
        _studentRepositoryMock = new Mock<IStudentRepository>();
        _mapperMock = new Mock<IMapper>();
        _sut = new AttendanceService(_studentRepositoryMock.Object, _mapperMock.Object);
    }

    [Fact]
    public async Task ReturnsNotFound_WhenNoSessionExists()
    {
        var studentId = Guid.NewGuid();
        var dto = new MarkAttendanceDto { CourseId = Guid.NewGuid(), Latitude = 6.5, Longitude = 3.3 };

        _studentRepositoryMock
            .Setup(x => x.GetSession(dto.CourseId))
            .ReturnsAsync((AttendanceSession)null);

        var response = await _sut.MarkAttendance(studentId, dto);

        Assert.Equal(404, response.Statuscode);
        Assert.Equal("No active session found for this course;", response.Message);
    }

    [Fact]
    public async Task ReturnsNotFound_WhenSessionIsNotActive()
    {
        var studentId = Guid.NewGuid();
        var dto = new MarkAttendanceDto { CourseId = Guid.NewGuid(), Latitude = 6.5, Longitude = 3.3 };

        var inactiveSession = new AttendanceSession
        {
            Id = Guid.NewGuid(),
            IsActive = false,
            Latitude = 6.5,
            Longitude = 3.3,
            radius = 50
        };

        _studentRepositoryMock
            .Setup(x => x.GetSession(dto.CourseId))
            .ReturnsAsync(inactiveSession);

        var response = await _sut.MarkAttendance(studentId, dto);

        Assert.Equal(404, response.Statuscode);
        Assert.Equal("No active session found for this course;", response.Message);
    }

    [Fact]
    public async Task ReturnsBadRequest_WhenAttendanceAlreadyMarked()
    {
        var studentId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();
        var dto = new MarkAttendanceDto { CourseId = Guid.NewGuid(), Latitude = 6.5, Longitude = 3.3 };

        var activeSession = new AttendanceSession
        {
            Id = sessionId,
            IsActive = true,
            Latitude = 6.5,
            Longitude = 3.3,
            radius = 50
        };

        _studentRepositoryMock.Setup(x => x.GetSession(dto.CourseId)).ReturnsAsync(activeSession);
        _mapperMock.Setup(x => x.Map<MarkAttendance>(dto)).Returns(new MarkAttendance());

        _studentRepositoryMock
            .Setup(x => x.getallattendance())
            .ReturnsAsync(new List<MarkAttendance>
            {
                new MarkAttendance { AttendanceSesionId = sessionId, StudentId = studentId }
            });

        var response = await _sut.MarkAttendance(studentId, dto);

        Assert.Equal(400, response.Statuscode);
        Assert.Equal("Attendance already marked", response.Message);
        _studentRepositoryMock.Verify(x => x.MarkAttendance(It.IsAny<MarkAttendance>()), Times.Never);
    }

    [Fact]
    public async Task ReturnsSuccess_WhenWithinRadius_AndNotAlreadyMarked()
    {
        var studentId = Guid.NewGuid();
        var sessionId = Guid.NewGuid();
        var dto = new MarkAttendanceDto { CourseId = Guid.NewGuid(), Latitude = 6.5244, Longitude = 3.3792 };

        var activeSession = new AttendanceSession
        {
            Id = sessionId,
            IsActive = true,
            Latitude = 6.5244, // same coordinates -> distance = 0
            Longitude = 3.3792,
            radius = 50
        };

        var mappedAttendance = new MarkAttendance();
        var responseDto = new AtttendanceReponseDto();

        _studentRepositoryMock.Setup(x => x.GetSession(dto.CourseId)).ReturnsAsync(activeSession);
        _mapperMock.Setup(x => x.Map<MarkAttendance>(dto)).Returns(mappedAttendance);
        _studentRepositoryMock.Setup(x => x.getallattendance()).ReturnsAsync(new List<MarkAttendance>());
        _studentRepositoryMock.Setup(x => x.MarkAttendance(mappedAttendance)).ReturnsAsync(1);
        _mapperMock.Setup(x => x.Map<AtttendanceReponseDto>(mappedAttendance)).Returns(responseDto);

        var response = await _sut.MarkAttendance(studentId, dto);

        Assert.Equal(200, response.Statuscode);
        Assert.Equal("Attendance Marked Successfully", response.Message);
        Assert.Equal(responseDto, response.Data);
        Assert.True(mappedAttendance.AttendanceStatus);
        Assert.Equal(sessionId, mappedAttendance.AttendanceSesionId);
        Assert.Equal(studentId, mappedAttendance.StudentId);
    }

    [Fact]
    public async Task MarksAttendanceFalse_WhenOutsideRadius_ButStillSavesRecord()
    {
        var
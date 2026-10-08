output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.rewatch.id
}

output "public_ip" {
  description = "Public IP of ReWatch EC2"
  value       = aws_instance.rewatch.public_ip
}

output "public_dns" {
  description = "Public DNS of ReWatch EC2"
  value       = aws_instance.rewatch.public_dns
}